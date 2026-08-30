import asyncio
from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from coffix.carts.models import CartStatus
from coffix.carts.repository import CartRepository
from coffix.carts.service import CartService, calculate_cart_totals
from coffix.catalog.repository import CatalogRepository
from coffix.catalog.schemas import CategoryCreate, ProductCreate, SkuCreate, SkuUpdate
from coffix.core.clock import FakeClock
from coffix.inventory.repository import InventoryRepository
from coffix.inventory.service import InventoryService
from coffix.users.models import Role
from coffix.users.repository import UserRepository
from coffix.worker.expiration import CartExpirationService, ExpirationSummary, run_expiration_loop

NOW = datetime(2026, 8, 31, 11, 0, tzinfo=UTC)


async def create_customer(session: AsyncSession, phone: str) -> UUID:
    user = await UserRepository(session).create(phone_e164=phone, role=Role.CUSTOMER)
    return user.id


async def create_sku(
    session: AsyncSession,
    *,
    sku_code: str,
    stock_quantity: int | None,
    price_agorot: int = 2900,
) -> UUID:
    catalog = CatalogRepository(session)
    category = await catalog.create_category(
        CategoryCreate(name_he="עגלה", slug=f"cart-{sku_code.lower()}")
    )
    product = await catalog.create_product(
        ProductCreate(
            category_id=category.id,
            name_he=sku_code,
            description_he="מוצר לבדיקת עגלה",
            product_type="beans",
        )
    )
    sku = await catalog.create_sku(
        product.id,
        SkuCreate(
            sku_code=sku_code,
            price_agorot=price_agorot,
            stock_quantity=stock_quantity,
        ),
    )
    return sku.id


def cart_service(session: AsyncSession, clock: FakeClock) -> CartService:
    return CartService(
        CartRepository(session),
        InventoryService(InventoryRepository(session), clock=clock),
        clock=clock,
        ttl_seconds=3600,
    )


@pytest.mark.asyncio
async def test_one_active_cart_supports_mutations_server_prices_and_activity_refresh(
    database_session: AsyncSession,
) -> None:
    clock = FakeClock(NOW)
    customer_id = await create_customer(database_session, "+972501111111")
    sku_id = await create_sku(
        database_session,
        sku_code="CART-RULES",
        stock_quantity=None,
    )
    service = cart_service(database_session, clock)

    created = await service.get_or_create(customer_id)
    same_cart = await service.get_or_create(customer_id)
    added = await service.add_item(customer_id, sku_id, quantity=2)
    clock.advance(timedelta(minutes=10))
    increased = await service.add_item(customer_id, sku_id, quantity=1)

    catalog = CatalogRepository(database_session)
    sku = await catalog.get_sku(sku_id)
    assert sku is not None
    await catalog.update_sku(sku, SkuUpdate(price_agorot=3500))
    unchanged_read = await service.get_or_create(customer_id)
    repriced = await service.set_item(customer_id, sku_id, quantity=1)
    removed = await service.remove_item(customer_id, sku_id)

    assert created.cart.id == same_cart.cart.id == added.cart.id
    assert created.cart.expires_at == NOW + timedelta(hours=1)
    assert increased.cart.expires_at == NOW + timedelta(minutes=70)
    assert increased.cart.items[0].quantity == 3
    assert increased.cart.items[0].unit_price_agorot == 2900
    assert unchanged_read.cart.items[0].unit_price_agorot == 2900
    assert repriced.cart.items[0].unit_price_agorot == 3500
    assert calculate_cart_totals(
        [(item.unit_price_agorot, item.quantity) for item in repriced.cart.items]
    ).subtotal_agorot == 3500
    assert removed.cart.items == ()


@pytest.mark.asyncio
async def test_expired_access_releases_stock_and_next_access_creates_a_fresh_cart(
    database_session: AsyncSession,
) -> None:
    clock = FakeClock(NOW)
    first_customer = await create_customer(database_session, "+972502222222")
    second_customer = await create_customer(database_session, "+972503333333")
    sku_id = await create_sku(
        database_session,
        sku_code="EXPIRING",
        stock_quantity=2,
    )
    service = cart_service(database_session, clock)
    await service.add_item(first_customer, sku_id, quantity=2)
    clock.advance(timedelta(hours=1))

    expired = await service.get_or_create(first_customer)
    fresh = await service.get_or_create(first_customer)
    competing = await service.add_item(second_customer, sku_id, quantity=2)

    assert expired.expired is True
    assert expired.cart.status is CartStatus.EXPIRED
    assert fresh.expired is False
    assert fresh.cart.id != expired.cart.id
    assert fresh.cart.items == ()
    assert competing.cart.items[0].quantity == 2


@pytest.mark.asyncio
async def test_expiration_batches_are_bounded_idempotent_and_release_reservations(
    database_session: AsyncSession,
) -> None:
    clock = FakeClock(NOW)
    first_customer = await create_customer(database_session, "+972506666666")
    second_customer = await create_customer(database_session, "+972507777777")
    third_customer = await create_customer(database_session, "+972508888888")
    fourth_customer = await create_customer(database_session, "+972509999999")
    sku_id = await create_sku(
        database_session,
        sku_code="BATCH-EXPIRY",
        stock_quantity=4,
    )
    carts = cart_service(database_session, clock)
    await carts.add_item(first_customer, sku_id, quantity=2)
    await carts.add_item(second_customer, sku_id, quantity=2)
    clock.advance(timedelta(minutes=30))
    active_later = await carts.get_or_create(third_customer)
    clock.advance(timedelta(minutes=30))

    expiration = CartExpirationService(
        CartRepository(database_session),
        InventoryService(InventoryRepository(database_session), clock=clock),
    )
    first_batch = await expiration.expire_carts(clock.now(), batch_size=1)
    second_batch = await expiration.expire_carts(clock.now(), batch_size=1)
    empty_batch = await expiration.expire_carts(clock.now(), batch_size=10)
    reused = await carts.add_item(fourth_customer, sku_id, quantity=4)
    still_active = await carts.get_or_create(third_customer)

    assert first_batch.expired_count == 1
    assert second_batch.expired_count == 1
    assert first_batch.released_quantity + second_batch.released_quantity == 4
    assert empty_batch.expired_count == 0
    assert reused.cart.items[0].quantity == 4
    assert still_active.cart.id == active_later.cart.id


@pytest.mark.asyncio
async def test_expiration_worker_loop_runs_immediately_and_stops_gracefully(
    migrated_database_url: str,
) -> None:
    clock = FakeClock(NOW)
    engine = create_async_engine(migrated_database_url)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with factory() as session, session.begin():
            first_customer = await create_customer(session, "+972501010101")
            second_customer = await create_customer(session, "+972502020202")
            sku_id = await create_sku(
                session,
                sku_code="WORKER-LOOP",
                stock_quantity=2,
            )
            service = CartService(
                CartRepository(session),
                InventoryService(InventoryRepository(session), clock=clock),
                clock=clock,
                ttl_seconds=1,
            )
            await service.add_item(first_customer, sku_id, quantity=2)

        clock.advance(timedelta(seconds=1))
        stop_event = asyncio.Event()
        summaries: list[ExpirationSummary] = []

        def stop_after_pass(summary: ExpirationSummary) -> None:
            summaries.append(summary)
            stop_event.set()

        await asyncio.wait_for(
            run_expiration_loop(
                factory,
                clock=clock,
                stop_event=stop_event,
                interval_seconds=60,
                batch_size=10,
                on_pass=stop_after_pass,
            ),
            timeout=1,
        )

        async with factory() as session, session.begin():
            reused = await cart_service(session, clock).add_item(
                second_customer,
                sku_id,
                quantity=2,
            )

        assert summaries[0].expired_count == 1
        assert reused.cart.items[0].quantity == 2
    finally:
        await engine.dispose()

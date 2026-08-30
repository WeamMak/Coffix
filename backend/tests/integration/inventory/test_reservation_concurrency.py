import asyncio
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from coffix.catalog.repository import CatalogRepository
from coffix.catalog.schemas import CategoryCreate, ProductCreate, SkuCreate, SkuUpdate
from coffix.core.clock import FakeClock
from coffix.inventory.repository import InventoryRepository
from coffix.inventory.service import (
    InventoryConflict,
    InventoryMetricEvent,
    InventoryService,
)

NOW = datetime(2026, 8, 31, 9, 0, tzinfo=UTC)


class RecordingInventoryMetrics:
    def __init__(self) -> None:
        self.events: list[InventoryMetricEvent] = []

    def record(self, event: InventoryMetricEvent) -> None:
        self.events.append(event)


async def create_sku(
    session: AsyncSession,
    *,
    sku_code: str,
    stock_quantity: int | None,
    is_active: bool = True,
) -> UUID:
    catalog = CatalogRepository(session)
    category = await catalog.create_category(
        CategoryCreate(name_he="מלאי", slug=f"inventory-{sku_code.lower()}")
    )
    product = await catalog.create_product(
        ProductCreate(
            category_id=category.id,
            name_he=sku_code,
            description_he="מוצר לבדיקת מלאי",
            product_type="beans",
        )
    )
    sku = await catalog.create_sku(
        product.id,
        SkuCreate(
            sku_code=sku_code,
            price_agorot=1000,
            stock_quantity=stock_quantity,
            is_active=is_active,
        ),
    )
    return sku.id


def inventory_service(
    session: AsyncSession,
    clock: FakeClock,
    metrics: RecordingInventoryMetrics | None = None,
) -> InventoryService:
    return InventoryService(
        InventoryRepository(session),
        clock=clock,
        metrics=metrics,
    )


@pytest.mark.asyncio
async def test_reserve_handles_unlimited_tracked_changes_and_conflicts(
    database_session: AsyncSession,
) -> None:
    clock = FakeClock(NOW)
    metrics = RecordingInventoryMetrics()
    unlimited_sku = await create_sku(
        database_session,
        sku_code="UNLIMITED",
        stock_quantity=None,
    )
    tracked_sku = await create_sku(
        database_session,
        sku_code="TRACKED",
        stock_quantity=10,
    )
    inactive_sku = await create_sku(
        database_session,
        sku_code="INACTIVE",
        stock_quantity=10,
        is_active=False,
    )
    service = inventory_service(database_session, clock, metrics)
    cart_id = uuid4()
    expires_at = NOW + timedelta(hours=1)

    unlimited = await service.reserve(cart_id, unlimited_sku, 500, expires_at)
    created = await service.reserve(cart_id, tracked_sku, 4, expires_at)
    increased = await service.reserve(cart_id, tracked_sku, 7, expires_at)
    decreased = await service.reserve(cart_id, tracked_sku, 2, expires_at)
    removed = await service.reserve(cart_id, tracked_sku, 0, expires_at)

    assert unlimited.is_tracked is False
    assert [created.available_quantity, increased.available_quantity] == [6, 3]
    assert [decreased.available_quantity, removed.available_quantity] == [8, 10]

    with pytest.raises(InventoryConflict) as inactive:
        await service.reserve(uuid4(), inactive_sku, 1, expires_at)
    assert inactive.value.code == "SKU_INACTIVE"

    first_cart = uuid4()
    await service.reserve(first_cart, tracked_sku, 8, expires_at)
    with pytest.raises(InventoryConflict) as insufficient:
        await service.reserve(uuid4(), tracked_sku, 3, expires_at)
    assert insufficient.value.code == "INSUFFICIENT_STOCK"
    assert [event.quantity for event in metrics.events if event.kind == "reserve"] == [4, 3, 8]
    assert [event.quantity for event in metrics.events if event.kind == "release"] == [5, 2]
    assert [event.code for event in metrics.events if event.kind == "conflict"] == [
        "SKU_INACTIVE",
        "INSUFFICIENT_STOCK",
    ]


@pytest.mark.asyncio
async def test_release_transfer_and_consume_are_idempotent_and_expiry_is_rejected(
    database_session: AsyncSession,
) -> None:
    clock = FakeClock(NOW)
    sku_id = await create_sku(
        database_session,
        sku_code="LIFECYCLE",
        stock_quantity=5,
    )
    service = inventory_service(database_session, clock)
    released_cart = uuid4()
    checkout_cart = uuid4()
    expired_cart = uuid4()
    order_id = uuid4()
    expires_at = NOW + timedelta(hours=1)

    await service.reserve(released_cart, sku_id, 1, expires_at)
    first_release = await service.release_cart(released_cart)
    second_release = await service.release_cart(released_cart)

    await service.reserve(checkout_cart, sku_id, 3, expires_at)
    first_transfer = await service.transfer_to_order(
        checkout_cart,
        order_id,
        NOW + timedelta(minutes=30),
    )
    second_transfer = await service.transfer_to_order(
        checkout_cart,
        order_id,
        NOW + timedelta(minutes=30),
    )
    first_consume = await service.consume_order(order_id)
    second_consume = await service.consume_order(order_id)

    await service.reserve(expired_cart, sku_id, 2, expires_at)
    clock.advance(timedelta(hours=1))
    with pytest.raises(InventoryConflict) as expired:
        await service.reserve(expired_cart, sku_id, 1, NOW + timedelta(hours=2))

    assert (first_release.affected_count, second_release.affected_count) == (1, 0)
    assert (first_transfer.affected_count, second_transfer.affected_count) == (1, 0)
    assert (first_consume.affected_count, second_consume.affected_count) == (1, 0)
    assert expired.value.code == "RESERVATION_EXPIRED"

    with pytest.raises(InventoryConflict) as stock_was_consumed_once:
        await service.reserve(uuid4(), sku_id, 3, NOW + timedelta(hours=2))
    assert stock_was_consumed_once.value.code == "INSUFFICIENT_STOCK"


@pytest.mark.asyncio
async def test_inactive_sku_allows_existing_reservation_decrease_and_removal(
    database_session: AsyncSession,
) -> None:
    clock = FakeClock(NOW)
    sku_id = await create_sku(
        database_session,
        sku_code="DEACTIVATED",
        stock_quantity=5,
    )
    service = inventory_service(database_session, clock)
    cart_id = uuid4()
    expires_at = NOW + timedelta(hours=1)
    await service.reserve(cart_id, sku_id, 4, expires_at)

    catalog = CatalogRepository(database_session)
    sku = await catalog.get_sku(sku_id)
    assert sku is not None
    await catalog.update_sku(sku, SkuUpdate(is_active=False))

    decreased = await service.reserve(cart_id, sku_id, 2, expires_at)
    removed = await service.reserve(cart_id, sku_id, 0, expires_at)
    with pytest.raises(InventoryConflict) as new_reservation:
        await service.reserve(uuid4(), sku_id, 1, expires_at)

    assert decreased.reserved_quantity == 2
    assert removed.reserved_quantity == 0
    assert new_reservation.value.code == "SKU_INACTIVE"


@pytest.mark.asyncio
@pytest.mark.parametrize("concurrency_iteration", range(5))
async def test_simultaneous_reservations_never_exceed_tracked_stock(
    migrated_database_url: str,
    concurrency_iteration: int,
) -> None:
    del concurrency_iteration
    engine = create_async_engine(migrated_database_url, pool_size=10)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with factory() as setup_session, setup_session.begin():
            sku_id = await create_sku(
                setup_session,
                sku_code="CONCURRENT",
                stock_quantity=10,
            )

        ready = asyncio.Event()
        ready_count = 0
        ready_lock = asyncio.Lock()

        async def reserve_two() -> int:
            nonlocal ready_count
            async with ready_lock:
                ready_count += 1
                if ready_count == 8:
                    ready.set()
            await ready.wait()
            try:
                async with factory() as session, session.begin():
                    service = inventory_service(session, FakeClock(NOW))
                    result = await service.reserve(
                        uuid4(),
                        sku_id,
                        2,
                        NOW + timedelta(hours=1),
                    )
                    return result.reserved_quantity
            except InventoryConflict as conflict:
                assert conflict.code == "INSUFFICIENT_STOCK"
                return 0

        attempts: list[Callable[[], Awaitable[int]]] = [reserve_two] * 8
        successful_total = sum(await asyncio.gather(*(attempt() for attempt in attempts)))

        assert successful_total == 10
    finally:
        await engine.dispose()

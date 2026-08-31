from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from coffix.api.app import create_app
from coffix.auth.policies import CurrentActor, get_current_actor
from coffix.catalog.repository import CatalogRepository
from coffix.catalog.schemas import CategoryCreate, ProductCreate, SkuCreate
from coffix.core.clock import FakeClock
from coffix.core.settings import Settings
from coffix.users.models import Role
from coffix.users.repository import UserRepository

NOW = datetime(2026, 8, 31, 12, 0, tzinfo=UTC)


async def seed_cart_api(database_url: str) -> tuple[CurrentActor, CurrentActor, UUID]:
    engine = create_async_engine(database_url)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with factory() as session, session.begin():
            users = UserRepository(session)
            first = await users.create(phone_e164="+972504444444", role=Role.CUSTOMER)
            second = await users.create(phone_e164="+972505555555", role=Role.CUSTOMER)
            catalog = CatalogRepository(session)
            category = await catalog.create_category(
                CategoryCreate(name_he="עגלה", slug="cart-api")
            )
            product = await catalog.create_product(
                ProductCreate(
                    category_id=category.id,
                    name_he="פולי קפה",
                    description_he="תערובת",
                    product_type="beans",
                )
            )
            sku = await catalog.create_sku(
                product.id,
                SkuCreate(
                    sku_code="CART-API",
                    price_agorot=2900,
                    stock_quantity=2,
                ),
            )
            return (
                CurrentActor(user_id=first.id, role=first.role),
                CurrentActor(user_id=second.id, role=second.role),
                sku.id,
            )
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_cart_api_enforces_authentication_ownership_and_atomic_stock(
    migrated_database_url: str,
) -> None:
    first, second, sku_id = await seed_cart_api(migrated_database_url)
    clock = FakeClock(NOW)
    app = create_app(Settings(app_env="test", database_url=migrated_database_url))

    async with app.router.lifespan_context(app):
        app.state.clock = clock
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            unauthenticated = await client.get("/api/v1/cart")

            app.dependency_overrides[get_current_actor] = lambda: first
            first_empty = await client.get("/api/v1/cart")
            first_reserved = await client.post(
                "/api/v1/cart/items",
                json={"sku_id": str(sku_id), "quantity": 2},
            )

            app.dependency_overrides[get_current_actor] = lambda: second
            second_rejected = await client.post(
                "/api/v1/cart/items",
                json={"sku_id": str(sku_id), "quantity": 1},
            )
            second_cart = await client.get("/api/v1/cart")

            app.dependency_overrides[get_current_actor] = lambda: first
            first_decreased = await client.put(
                f"/api/v1/cart/items/{sku_id}",
                json={"quantity": 1},
            )

            app.dependency_overrides[get_current_actor] = lambda: second
            second_reserved = await client.post(
                "/api/v1/cart/items",
                json={"sku_id": str(sku_id), "quantity": 1},
            )

            app.dependency_overrides[get_current_actor] = lambda: first
            first_removed = await client.delete(f"/api/v1/cart/items/{sku_id}")

    assert unauthenticated.status_code == 401
    assert first_empty.status_code == 200
    assert first_empty.json()["items"] == []
    assert first_reserved.status_code == 201
    assert first_reserved.json()["subtotal_agorot"] == 5800
    assert first_reserved.json()["total_quantity"] == 2
    assert first_reserved.json()["currency"] == "ILS"
    assert second_rejected.status_code == 409
    assert second_rejected.json()["code"] == "INSUFFICIENT_STOCK"
    assert second_cart.json()["items"] == []
    assert first_decreased.json()["items"][0]["quantity"] == 1
    assert second_reserved.status_code == 201
    assert second_reserved.json()["items"][0]["quantity"] == 1
    assert first_removed.status_code == 200
    assert first_removed.json()["items"] == []


@pytest.mark.asyncio
async def test_expired_cart_api_releases_synchronously_before_returning_conflict(
    migrated_database_url: str,
) -> None:
    first, second, sku_id = await seed_cart_api(migrated_database_url)
    clock = FakeClock(NOW)
    app = create_app(Settings(app_env="test", database_url=migrated_database_url))
    app.dependency_overrides[get_current_actor] = lambda: first

    async with app.router.lifespan_context(app):
        app.state.clock = clock
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            await client.post(
                "/api/v1/cart/items",
                json={"sku_id": str(sku_id), "quantity": 2},
            )
            clock.advance(timedelta(hours=1))
            expired = await client.get("/api/v1/cart")
            fresh = await client.get("/api/v1/cart")

            app.dependency_overrides[get_current_actor] = lambda: second
            reused_stock = await client.post(
                "/api/v1/cart/items",
                json={"sku_id": str(sku_id), "quantity": 2},
            )

    assert expired.status_code == 409
    assert expired.json()["code"] == "CART_EXPIRED"
    assert fresh.status_code == 200
    assert fresh.json()["items"] == []
    assert reused_stock.status_code == 201

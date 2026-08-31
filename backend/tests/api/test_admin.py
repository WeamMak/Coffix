from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from coffix.api.app import create_app
from coffix.auth.policies import CurrentActor, get_current_actor
from coffix.carts.models import Cart, CartStatus
from coffix.catalog.repository import CatalogRepository
from coffix.catalog.schemas import CategoryCreate, ProductCreate, SkuCreate
from coffix.core.clock import FakeClock
from coffix.core.settings import Settings
from coffix.notifications.models import AuditLog
from coffix.orders.models import Order, OrderState
from coffix.users.models import Role
from coffix.users.repository import UserRepository

NOW = datetime(2026, 8, 31, 20, 0, tzinfo=UTC)


async def seed_admin_api(database_url: str) -> tuple[CurrentActor, CurrentActor, UUID, UUID]:
    engine = create_async_engine(database_url)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with factory() as session, session.begin():
            users = UserRepository(session)
            admin = await users.create(phone_e164="+972501000001", role=Role.ADMIN)
            customer = await users.create(phone_e164="+972501000002", role=Role.CUSTOMER)
            catalog = CatalogRepository(session)
            category = await catalog.create_category(
                CategoryCreate(name_he="ניהול", slug="admin-api")
            )
            product = await catalog.create_product(
                ProductCreate(
                    category_id=category.id,
                    name_he="מלאי",
                    description_he="מוצר לבדיקת ניהול",
                    product_type="accessory",
                )
            )
            sku = await catalog.create_sku(
                product.id,
                SkuCreate(sku_code="ADMIN-STOCK", price_agorot=1000, stock_quantity=5),
            )
            cart = Cart(
                customer_id=customer.id,
                status=CartStatus.CHECKED_OUT,
                last_activity_at=NOW,
                expires_at=NOW + timedelta(hours=1),
            )
            session.add(cart)
            await session.flush()
            session.add(
                Order(
                    customer_id=customer.id,
                    source_cart_id=cart.id,
                    order_number="CFX-ADMIN-1",
                    state=OrderState.PROCESSING,
                    subtotal_agorot=1000,
                    shipping_agorot=0,
                    total_agorot=1000,
                    address_snapshot={"city": "Tel Aviv", "country": "IL"},
                    payment_deadline=NOW + timedelta(minutes=30),
                    checkout_idempotency_key="admin-api",
                    checkout_fingerprint="a" * 64,
                )
            )
            return (
                CurrentActor(admin.id, admin.role),
                CurrentActor(customer.id, customer.role),
                customer.id,
                sku.id,
            )
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_admin_access_dashboard_role_and_stock_commands_are_safe_and_audited(
    migrated_database_url: str,
) -> None:
    admin, customer, customer_id, sku_id = await seed_admin_api(migrated_database_url)
    app = create_app(Settings(app_env="test", database_url=migrated_database_url))
    async with app.router.lifespan_context(app):
        app.state.clock = FakeClock(NOW)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            app.dependency_overrides[get_current_actor] = lambda: customer
            forbidden = await client.get("/api/v1/admin/dashboard")

            app.dependency_overrides[get_current_actor] = lambda: admin
            dashboard = await client.get("/api/v1/admin/dashboard")
            configuration = await client.get("/api/v1/admin/configuration")
            order_queue = await client.get("/api/v1/admin/orders")
            inventory = await client.get("/api/v1/admin/inventory")
            promoted = await client.patch(
                f"/api/v1/admin/users/{customer_id}", json={"role": "technician"}
            )
            unsafe_self_change = await client.patch(
                f"/api/v1/admin/users/{admin.user_id}", json={"role": "customer"}
            )
            corrected = await client.post(
                f"/api/v1/admin/inventory/{sku_id}/corrections",
                json={"quantity": 8, "expected_quantity": 5, "reason": "Counted shelf"},
            )
            stale = await client.post(
                f"/api/v1/admin/inventory/{sku_id}/corrections",
                json={"quantity": 9, "expected_quantity": 5, "reason": "Stale screen"},
            )
            audits = await client.get("/api/v1/admin/audit-logs")

    assert forbidden.status_code == 403
    assert dashboard.status_code == 200
    assert dashboard.json()["users_by_role"] == {
        "admin": 1,
        "customer": 1,
        "technician": 0,
    }
    assert dashboard.json()["orders_by_state"]["processing"] == 1
    assert configuration.status_code == 200
    assert configuration.json()["products"][0]["skus"][0]["sku_code"] == "ADMIN-STOCK"
    assert order_queue.json()[0]["state"] == "processing"
    assert inventory.json()[0]["available_quantity"] == 5
    assert promoted.status_code == 200
    assert promoted.json()["role"] == "technician"
    assert unsafe_self_change.status_code == 409
    assert unsafe_self_change.json()["code"] == "unsafe_self_change"
    assert corrected.status_code == 200
    assert corrected.json()["stock_quantity"] == 8
    assert stale.status_code == 409
    assert stale.json()["code"] == "stock_changed"
    assert [item["action"] for item in audits.json()] == [
        "inventory.stock_corrected",
        "user.access_changed",
    ]

    engine = create_async_engine(migrated_database_url)
    try:
        async with engine.connect() as connection:
            count = await connection.scalar(select(func.count()).select_from(AuditLog))
        assert count == 2
    finally:
        await engine.dispose()

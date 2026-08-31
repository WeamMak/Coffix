from datetime import UTC, datetime
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

NOW = datetime(2026, 8, 31, 13, 0, tzinfo=UTC)


async def seed_order_api(
    database_url: str,
) -> tuple[CurrentActor, CurrentActor, CurrentActor, UUID]:
    engine = create_async_engine(database_url)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with factory() as session, session.begin():
            users = UserRepository(session)
            customer = await users.create(phone_e164="+972503333444", role=Role.CUSTOMER)
            other = await users.create(phone_e164="+972504444555", role=Role.CUSTOMER)
            admin = await users.create(phone_e164="+972505555666", role=Role.ADMIN)
            catalog = CatalogRepository(session)
            category = await catalog.create_category(
                CategoryCreate(name_he="הזמנות", slug="orders-api")
            )
            product = await catalog.create_product(
                ProductCreate(
                    category_id=category.id,
                    name_he="מוצר להזמנה",
                    description_he="בדיקת API",
                    product_type="accessory",
                )
            )
            sku = await catalog.create_sku(
                product.id,
                SkuCreate(sku_code="ORDER-API", price_agorot=2500, stock_quantity=5),
            )
            return (
                CurrentActor(customer.id, customer.role),
                CurrentActor(other.id, other.role),
                CurrentActor(admin.id, admin.role),
                sku.id,
            )
    finally:
        await engine.dispose()


def checkout_body(*, building: str = "7") -> dict[str, object]:
    return {
        "address": {
            "recipient_name": "לקוח הזמנה",
            "phone": "0503333444",
            "street": "הקפה",
            "building": building,
            "city": "תל אביב",
            "country": "IL",
        }
    }


@pytest.mark.asyncio
async def test_customer_checkout_list_and_detail_are_idempotent_and_owned(
    migrated_database_url: str,
) -> None:
    customer, other, _, sku_id = await seed_order_api(migrated_database_url)
    app = create_app(
        Settings(
            app_env="test",
            database_url=migrated_database_url,
            shipping_fee_agorot=3000,
        )
    )
    async with app.router.lifespan_context(app):
        app.state.clock = FakeClock(NOW)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            unauthenticated = await client.post(
                "/api/v1/checkout",
                json=checkout_body(),
                headers={"Idempotency-Key": "order-api-1"},
            )
            app.dependency_overrides[get_current_actor] = lambda: customer
            await client.post("/api/v1/cart/items", json={"sku_id": str(sku_id), "quantity": 2})
            missing_key = await client.post("/api/v1/checkout", json=checkout_body())
            created = await client.post(
                "/api/v1/checkout",
                json=checkout_body(),
                headers={"Idempotency-Key": "order-api-1"},
            )
            duplicate = await client.post(
                "/api/v1/checkout",
                json=checkout_body(),
                headers={"Idempotency-Key": "order-api-1"},
            )
            mismatched = await client.post(
                "/api/v1/checkout",
                json=checkout_body(building="8"),
                headers={"Idempotency-Key": "order-api-1"},
            )
            listed = await client.get("/api/v1/orders")
            detail = await client.get(f"/api/v1/orders/{created.json()['order']['id']}")

            app.dependency_overrides[get_current_actor] = lambda: other
            hidden = await client.get(f"/api/v1/orders/{created.json()['order']['id']}")

    assert unauthenticated.status_code == 401
    assert missing_key.status_code == 422
    assert created.status_code == 201
    assert duplicate.status_code == 201
    assert created.json()["order"]["id"] == duplicate.json()["order"]["id"]
    assert created.json()["order"]["subtotal_agorot"] == 5000
    assert created.json()["order"]["shipping_agorot"] == 3000
    assert created.json()["order"]["total_agorot"] == 8000
    assert created.json()["order"]["allowed_actions"] == []
    assert created.json()["payment"]["client_secret"].startswith("fake_pi_")
    assert mismatched.status_code == 409
    assert mismatched.json()["code"] == "IDEMPOTENCY_KEY_REUSED"
    assert [order["id"] for order in listed.json()] == [created.json()["order"]["id"]]
    assert detail.status_code == 200
    assert hidden.status_code == 404


@pytest.mark.asyncio
async def test_admin_order_transitions_tracking_cancellation_and_confirmed_full_refund(
    migrated_database_url: str,
) -> None:
    customer, _, admin, sku_id = await seed_order_api(migrated_database_url)
    app = create_app(Settings(app_env="test", database_url=migrated_database_url))
    async with app.router.lifespan_context(app):
        app.state.clock = FakeClock(NOW)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            app.dependency_overrides[get_current_actor] = lambda: customer
            await client.post("/api/v1/cart/items", json={"sku_id": str(sku_id), "quantity": 1})
            pending = await client.post(
                "/api/v1/checkout",
                json=checkout_body(),
                headers={"Idempotency-Key": "cancel-order"},
            )
            pending_order = pending.json()["order"]
            customer_cancel = await client.post(
                f"/api/v1/admin/orders/{pending_order['id']}/cancel",
                json={
                    "reason": "Customer called the shop",
                    "confirm_order_number": pending_order["order_number"],
                },
            )

            app.dependency_overrides[get_current_actor] = lambda: admin
            wrong_confirmation = await client.post(
                f"/api/v1/admin/orders/{pending_order['id']}/cancel",
                json={
                    "reason": "Duplicate order",
                    "confirm_order_number": "CFX-WRONG",
                },
            )
            cancelled = await client.post(
                f"/api/v1/admin/orders/{pending_order['id']}/cancel",
                json={
                    "reason": "Duplicate order",
                    "confirm_order_number": pending_order["order_number"],
                },
            )

            app.dependency_overrides[get_current_actor] = lambda: customer
            await client.post("/api/v1/cart/items", json={"sku_id": str(sku_id), "quantity": 2})
            checkout = await client.post(
                "/api/v1/checkout",
                json=checkout_body(),
                headers={"Idempotency-Key": "fulfill-order"},
            )
            order = checkout.json()["order"]
            provider_payment_id = checkout.json()["payment"]["provider_payment_id"]
            failed = await client.post(
                "/api/v1/test/payments/webhooks",
                json={
                    "event_id": "evt-order-failed",
                    "event_type": "payment_intent.payment_failed",
                    "provider_object_id": provider_payment_id,
                    "state": "failed",
                },
            )
            still_pending = await client.get(f"/api/v1/orders/{order['id']}")
            paid_event = await client.post(
                "/api/v1/test/payments/webhooks",
                json={
                    "event_id": "evt-order-paid",
                    "event_type": "payment_intent.succeeded",
                    "provider_object_id": provider_payment_id,
                    "state": "confirmed",
                },
            )

            app.dependency_overrides[get_current_actor] = lambda: admin
            processed = await client.post(f"/api/v1/admin/orders/{order['id']}/process")
            invalid_tracking = await client.post(
                f"/api/v1/admin/orders/{order['id']}/ship",
                json={
                    "carrier": "Israel Post",
                    "tracking_number": "TRACK-123",
                    "tracking_url": "javascript:alert(1)",
                },
            )
            shipped = await client.post(
                f"/api/v1/admin/orders/{order['id']}/ship",
                json={
                    "carrier": "Israel Post",
                    "tracking_number": "TRACK-123",
                    "tracking_url": "https://tracking.example/TRACK-123",
                },
            )
            delivered = await client.post(f"/api/v1/admin/orders/{order['id']}/deliver")
            refund = await client.post(
                f"/api/v1/admin/orders/{order['id']}/refund",
                json={
                    "reason": "Machine returned unopened",
                    "confirm_order_number": order["order_number"],
                },
                headers={"Idempotency-Key": "refund-order-1"},
            )
            duplicate_refund = await client.post(
                f"/api/v1/admin/orders/{order['id']}/refund",
                json={
                    "reason": "Machine returned unopened",
                    "confirm_order_number": order["order_number"],
                },
                headers={"Idempotency-Key": "refund-order-1"},
            )
            refund_event = await client.post(
                "/api/v1/test/payments/webhooks",
                json={
                    "event_id": "evt-refund-confirmed",
                    "event_type": "refund.succeeded",
                    "provider_object_id": refund.json()["provider_refund_id"],
                    "state": "confirmed",
                },
            )

            app.dependency_overrides[get_current_actor] = lambda: customer
            refunded = await client.get(f"/api/v1/orders/{order['id']}")

    assert customer_cancel.status_code == 403
    assert wrong_confirmation.status_code == 409
    assert cancelled.status_code == 200
    assert cancelled.json()["state"] == "cancelled"
    assert failed.json() == {"result": "processed"}
    assert still_pending.json()["state"] == "pending_payment"
    assert paid_event.json() == {"result": "processed"}
    assert processed.json()["state"] == "processing"
    assert invalid_tracking.status_code == 422
    assert shipped.json()["state"] == "shipped"
    assert shipped.json()["shipment"]["tracking_number"] == "TRACK-123"
    assert delivered.json()["state"] == "delivered"
    assert refund.status_code == 202
    assert refund.json()["amount_agorot"] == delivered.json()["total_agorot"]
    assert duplicate_refund.json()["refund_id"] == refund.json()["refund_id"]
    assert refund_event.json() == {"result": "processed"}
    assert refunded.json()["state"] == "refunded"

from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from urllib.parse import urlparse
from uuid import UUID

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from coffix.api.app import create_app
from coffix.auth.policies import CurrentActor, get_current_actor
from coffix.carts.models import Cart, CartStatus
from coffix.catalog.repository import CatalogRepository, MachineModelRepository
from coffix.catalog.schemas import (
    CategoryCreate,
    MachineModelCreate,
    ProductCreate,
    SkuCreate,
)
from coffix.core.clock import FakeClock
from coffix.core.settings import Settings
from coffix.machines.repository import MachineRepository
from coffix.media.service import run_media_cleanup_pass
from coffix.orders.models import Order, OrderItem, OrderState
from coffix.users.models import Role
from coffix.users.repository import UserRepository

NOW = datetime(2026, 8, 31, 16, 0, tzinfo=UTC)
JPEG = b"\xff\xd8\xff\xe0machine-photo"


async def seed_machine_api(
    database_url: str,
) -> tuple[CurrentActor, CurrentActor, CurrentActor, UUID, UUID, UUID]:
    engine = create_async_engine(database_url)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with factory() as session, session.begin():
            users = UserRepository(session)
            customer = await users.create(phone_e164="+972501235501", role=Role.CUSTOMER)
            other = await users.create(phone_e164="+972501235502", role=Role.CUSTOMER)
            technician = await users.create(phone_e164="+972501235503", role=Role.TECHNICIAN)
            models = MachineModelRepository(session)
            active_model = await models.create(
                MachineModelCreate(
                    manufacturer="Coffix",
                    model_name="Manual API",
                    serial_pattern=r"^API-[0-9]{4}$",
                )
            )
            inactive_model = await models.create(
                MachineModelCreate(
                    manufacturer="Coffix",
                    model_name="Inactive API",
                    is_active=False,
                )
            )
            purchased_model = await models.create(
                MachineModelCreate(
                    manufacturer="Coffix",
                    model_name="Purchased API",
                    serial_pattern=r"^ORDER-[0-9]{4}$",
                    default_warranty_months=18,
                    is_active=False,
                )
            )
            machines = MachineRepository(session)
            await machines.create_manual_registration(
                customer_id=other.id,
                machine_model_id=active_model.id,
                serial_number="API-0001",
                purchase_date=None,
            )

            catalog = CatalogRepository(session)
            category = await catalog.create_category(
                CategoryCreate(name_he="מכונות API", slug="machine-api")
            )
            product = await catalog.create_product(
                ProductCreate(
                    category_id=category.id,
                    name_he="מכונה שנרכשה",
                    description_he="מכונה לבדיקת השלמת מספר סידורי",
                    product_type="machine",
                )
            )
            sku = await catalog.create_sku(
                product.id,
                SkuCreate(
                    sku_code="MACHINE-API-ORDER",
                    price_agorot=100_000,
                    stock_quantity=1,
                    machine_model_id=purchased_model.id,
                ),
            )
            cart = Cart(
                customer_id=customer.id,
                status=CartStatus.CHECKED_OUT,
                last_activity_at=NOW,
                expires_at=NOW,
                version=1,
            )
            session.add(cart)
            await session.flush()
            order = Order(
                customer_id=customer.id,
                source_cart_id=cart.id,
                payment_id=None,
                order_number="CFX-MACHINE-API",
                state=OrderState.PAID,
                subtotal_agorot=100_000,
                shipping_agorot=0,
                total_agorot=100_000,
                currency="ILS",
                address_snapshot={"city": "Tel Aviv", "country": "IL"},
                payment_deadline=NOW + timedelta(minutes=30),
                checkout_idempotency_key="machine-api-order",
                checkout_fingerprint="a" * 64,
                items=[],
                history=[],
            )
            session.add(order)
            await session.flush()
            item = OrderItem(
                order_id=order.id,
                sku_id=sku.id,
                product_id=product.id,
                product_name_he=product.name_he,
                sku_code=sku.sku_code,
                attributes={},
                unit_price_agorot=100_000,
                quantity=1,
                line_total_agorot=100_000,
                currency="ILS",
                machine_model_id=purchased_model.id,
                machine_manufacturer=purchased_model.manufacturer,
                machine_model_name=purchased_model.model_name,
                machine_warranty_months=18,
            )
            session.add(item)
            await session.flush()
            purchased = await machines.create_order_registration(
                customer_id=customer.id,
                machine_model_id=purchased_model.id,
                order_item_id=item.id,
                source_unit_index=1,
                purchase_date=date(2026, 8, 31),
                warranty_months=18,
                warranty_end_date=date(2028, 2, 29),
            )
            return (
                CurrentActor(customer.id, customer.role),
                CurrentActor(other.id, other.role),
                CurrentActor(technician.id, technician.role),
                active_model.id,
                inactive_model.id,
                purchased.id,
            )
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_customer_registers_lists_and_views_only_owned_machines_with_photo(
    migrated_database_url: str,
    tmp_path: Path,
) -> None:
    (
        customer,
        other,
        technician,
        active_model_id,
        inactive_model_id,
        purchased_id,
    ) = await seed_machine_api(migrated_database_url)
    app = create_app(
        Settings(
            app_env="test",
            database_url=migrated_database_url,
            api_public_url="http://test",
            media_local_root=str(tmp_path),
        )
    )
    async with app.router.lifespan_context(app):
        app.state.clock = FakeClock(NOW)
        app.state.media_store.clock = app.state.clock
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            unauthenticated = await client.get("/api/v1/machines")
            app.dependency_overrides[get_current_actor] = lambda: technician
            forbidden = await client.get("/api/v1/machines")

            app.dependency_overrides[get_current_actor] = lambda: customer
            upload = await client.post(
                "/api/v1/media/uploads",
                json={
                    "purpose": "machine_registration",
                    "content_type": "image/jpeg",
                    "size_bytes": len(JPEG),
                },
            )
            await client.put(
                urlparse(upload.json()["upload_url"]).path,
                content=JPEG,
                headers={"Content-Type": "image/jpeg"},
            )
            media = await client.post(
                f"/api/v1/media/uploads/{upload.json()['upload_id']}/complete"
            )
            created = await client.post(
                "/api/v1/machines",
                json={
                    "machine_model_id": str(active_model_id),
                    "serial_number": " api-0042 ",
                    "purchase_date": "2025-05-06",
                    "media_id": media.json()["id"],
                },
            )
            listed = await client.get("/api/v1/machines")
            detail = await client.get(f"/api/v1/machines/{created.json()['id']}")
            discard_attached = await client.delete(f"/api/v1/media/{media.json()['id']}")
            assert discard_attached.status_code == 409
            app.state.clock.advance(timedelta(days=2))
            assert await run_media_cleanup_pass(
                app.state.session_factory,
                store=app.state.media_store,
                clock=app.state.clock,
                batch_size=100,
            ) == 0
            assert (
                await client.get(f"/api/v1/media/{media.json()['id']}/download")
            ).status_code == 200
            inactive = await client.post(
                "/api/v1/machines",
                json={
                    "machine_model_id": str(inactive_model_id),
                    "serial_number": "INACTIVE-1",
                },
            )

            app.dependency_overrides[get_current_actor] = lambda: other
            hidden = await client.get(f"/api/v1/machines/{created.json()['id']}")
            duplicate = await client.post(
                "/api/v1/machines",
                json={
                    "machine_model_id": str(active_model_id),
                    "serial_number": " api-0042 ",
                },
            )
            other_list = await client.get("/api/v1/machines")

    assert unauthenticated.status_code == 401
    assert forbidden.status_code == 403
    assert created.status_code == 201
    assert created.json()["serial_number"] == "API-0042"
    assert created.json()["source"] == "manual"
    assert created.json()["purchase_date"] == "2025-05-06"
    assert created.json()["warranty_start_date"] is None
    assert created.json()["warranty_end_date"] is None
    assert created.json()["warranty_months"] is None
    assert created.json()["warranty_status"] == "none"
    assert created.json()["media_ids"] == [media.json()["id"]]
    assert created.json()["service_history"] == []
    assert created.json()["model"]["model_name"] == "Manual API"
    assert {item["id"] for item in listed.json()} == {created.json()["id"], str(purchased_id)}
    assert detail.json() == created.json()
    assert inactive.status_code == 422
    assert inactive.json()["code"] == "MACHINE_MODEL_NOT_AVAILABLE"
    assert hidden.status_code == 404
    assert duplicate.status_code == 409
    assert duplicate.json()["code"] == "MACHINE_SERIAL_ALREADY_REGISTERED"
    assert str(customer.user_id) not in duplicate.text
    assert len(other_list.json()) == 1


@pytest.mark.asyncio
async def test_customer_lists_only_active_supported_models(
    migrated_database_url: str,
) -> None:
    customer, _, technician, active_model_id, inactive_model_id, _ = await seed_machine_api(
        migrated_database_url
    )
    app = create_app(Settings(app_env="test", database_url=migrated_database_url))
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            unauthenticated = await client.get("/api/v1/machines/models")
            app.dependency_overrides[get_current_actor] = lambda: technician
            forbidden = await client.get("/api/v1/machines/models")

            app.dependency_overrides[get_current_actor] = lambda: customer
            listed = await client.get("/api/v1/machines/models")

    assert unauthenticated.status_code == 401
    assert forbidden.status_code == 403
    assert listed.status_code == 200
    model_ids = {item["id"] for item in listed.json()}
    assert model_ids == {str(active_model_id)}
    assert str(inactive_model_id) not in model_ids
    assert listed.json()[0]["model_name"] == "Manual API"
    assert set(listed.json()[0].keys()) == {"id", "manufacturer", "model_name"}


@pytest.mark.asyncio
async def test_customer_completes_only_owned_pending_serial_without_warranty_changes(
    migrated_database_url: str,
    tmp_path: Path,
) -> None:
    customer, other, _, active_model_id, _, purchased_id = await seed_machine_api(
        migrated_database_url
    )
    app = create_app(
        Settings(
            app_env="test",
            database_url=migrated_database_url,
            media_local_root=str(tmp_path),
        )
    )
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            app.dependency_overrides[get_current_actor] = lambda: other
            hidden = await client.patch(
                f"/api/v1/machines/{purchased_id}/serial",
                json={"serial_number": "ORDER-0002"},
            )
            duplicate = await client.patch(
                f"/api/v1/machines/{purchased_id}/serial",
                json={"serial_number": "API-0001"},
            )

            app.dependency_overrides[get_current_actor] = lambda: customer
            attempted_warranty_change = await client.patch(
                f"/api/v1/machines/{purchased_id}/serial",
                json={"serial_number": "ORDER-0042", "warranty_months": 99},
            )
            completed = await client.patch(
                f"/api/v1/machines/{purchased_id}/serial",
                json={"serial_number": " order-0042 "},
            )
            repeated = await client.patch(
                f"/api/v1/machines/{purchased_id}/serial",
                json={"serial_number": "ORDER-0043"},
            )

    assert hidden.status_code == 404
    assert duplicate.status_code == 404
    assert attempted_warranty_change.status_code == 422
    assert completed.status_code == 200
    assert completed.json()["serial_number"] == "ORDER-0042"
    assert completed.json()["serial_pending"] is False
    assert completed.json()["source"] == "order"
    assert completed.json()["warranty_months"] == 18
    assert completed.json()["warranty_start_date"] == "2026-08-31"
    assert completed.json()["warranty_end_date"] == "2028-02-29"
    assert completed.json()["warranty_status"] == "active"
    assert repeated.status_code == 409
    assert repeated.json()["code"] == "MACHINE_SERIAL_ALREADY_COMPLETED"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("server_time", "expected"),
    [
        ("2028-02-29T12:00:00+02:00", "active"),
        ("2028-02-29T23:59:59+02:00", "active"),
        ("2028-03-01T00:00:00+02:00", "expired"),
    ],
)
async def test_warranty_status_uses_the_full_israeli_expiry_date(
    migrated_database_url: str,
    server_time: str,
    expected: str,
) -> None:
    customer, _, _, _, _, purchased_id = await seed_machine_api(migrated_database_url)
    app = create_app(Settings(app_env="test", database_url=migrated_database_url))
    async with app.router.lifespan_context(app):
        app.state.clock = FakeClock(datetime.fromisoformat(server_time))
        app.dependency_overrides[get_current_actor] = lambda: customer
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            detail = await client.get(f"/api/v1/machines/{purchased_id}")
            listed = await client.get("/api/v1/machines")
    assert detail.json()["warranty_status"] == expected
    purchased = next(item for item in listed.json() if item["id"] == str(purchased_id))
    assert purchased["warranty_status"] == expected

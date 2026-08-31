from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlparse
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from coffix.api.app import create_app
from coffix.auth.policies import CurrentActor, get_current_actor
from coffix.catalog.repository import MachineModelRepository
from coffix.catalog.schemas import MachineModelCreate
from coffix.core.clock import FakeClock
from coffix.core.settings import Settings
from coffix.machines.repository import MachineRepository
from coffix.service.models import (
    OutboxEvent,
    ServiceNote,
    ServiceNoteVisibility,
)
from coffix.users.models import Role
from coffix.users.repository import AddressRepository, UserRepository
from coffix.users.schemas import AddressCreate

NOW = datetime(2026, 8, 31, 12, 0, tzinfo=UTC)
JPEG = b"\xff\xd8\xff\xe0service-photo"


async def seed_service_api(
    database_url: str,
) -> tuple[CurrentActor, CurrentActor, CurrentActor, UUID, UUID, UUID, UUID, UUID]:
    engine = create_async_engine(database_url)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with factory() as session, session.begin():
            users = UserRepository(session)
            customer = await users.create(phone_e164="+972501236601", role=Role.CUSTOMER)
            other = await users.create(phone_e164="+972501236602", role=Role.CUSTOMER)
            admin = await users.create(phone_e164="+972501236603", role=Role.ADMIN)
            models = MachineModelRepository(session)
            supported_model = await models.create(
                MachineModelCreate(
                    manufacturer="Coffix",
                    model_name="Service API",
                )
            )
            other_model = await models.create(
                MachineModelCreate(
                    manufacturer="Coffix",
                    model_name="Other Service API",
                )
            )
            machines = MachineRepository(session)
            machine = await machines.create_manual_registration(
                customer_id=customer.id,
                machine_model_id=supported_model.id,
                serial_number="SERVICE-API-1",
                purchase_date=None,
            )
            foreign_machine = await machines.create_manual_registration(
                customer_id=other.id,
                machine_model_id=supported_model.id,
                serial_number="SERVICE-API-2",
                purchase_date=None,
            )
            address = await AddressRepository(session).create(
                customer.id,
                AddressCreate(
                    recipient_name="לקוח קופיקס",
                    phone="0501236601",
                    street="הרצל",
                    building="10",
                    city="חיפה",
                    country="IL",
                ),
            )
            return (
                CurrentActor(customer.id, customer.role),
                CurrentActor(other.id, other.role),
                CurrentActor(admin.id, admin.role),
                machine.id,
                foreign_machine.id,
                supported_model.id,
                other_model.id,
                address.id,
            )
    finally:
        await engine.dispose()


async def upload_issue_media(
    client: AsyncClient,
    *,
    collection_id: UUID,
) -> str:
    upload = await client.post(
        "/api/v1/media/uploads",
        json={
            "purpose": "service_issue",
            "collection_id": str(collection_id),
            "content_type": "image/jpeg",
            "size_bytes": len(JPEG),
        },
    )
    assert upload.status_code == 201
    stored = await client.put(
        urlparse(upload.json()["upload_url"]).path,
        content=JPEG,
        headers={"Content-Type": "image/jpeg"},
    )
    assert stored.status_code == 204
    completed = await client.post(f"/api/v1/media/uploads/{upload.json()['upload_id']}/complete")
    assert completed.status_code == 201
    return completed.json()["id"]


@pytest.mark.asyncio
async def test_customer_service_intake_projection_and_prepaid_cancellation(
    migrated_database_url: str,
    tmp_path: Path,
) -> None:
    (
        customer,
        other,
        admin,
        machine_id,
        foreign_machine_id,
        model_id,
        other_model_id,
        address_id,
    ) = await seed_service_api(migrated_database_url)
    app = create_app(
        Settings(
            app_env="test",
            database_url=migrated_database_url,
            api_public_url="http://test",
            media_local_root=str(tmp_path),
            shop_address_json=(
                '{"street":"Dizengoff","building":"1","city":"Tel Aviv","country":"IL"}'
            ),
        )
    )
    async with app.router.lifespan_context(app):
        app.state.clock = FakeClock(NOW)
        app.state.media_store.clock = app.state.clock
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            app.dependency_overrides[get_current_actor] = lambda: customer
            forbidden_config = await client.post(
                "/api/v1/admin/service-types",
                json={
                    "label_he": "בדיקה ותיקון",
                    "label_en": "Inspection and repair",
                    "diagnostic_fee_agorot": 12_500,
                    "machine_model_ids": [str(model_id)],
                },
            )

            app.dependency_overrides[get_current_actor] = lambda: admin
            configured = await client.post(
                "/api/v1/admin/service-types",
                json={
                    "label_he": "בדיקה ותיקון",
                    "label_en": "Inspection and repair",
                    "diagnostic_fee_agorot": 12_500,
                    "machine_model_ids": [str(model_id)],
                },
            )
            unsupported_type = await client.post(
                "/api/v1/admin/service-types",
                json={
                    "label_he": "שירות לדגם אחר",
                    "label_en": "Other model service",
                    "diagnostic_fee_agorot": 9_000,
                    "machine_model_ids": [str(other_model_id)],
                },
            )
            configured_list = await client.get("/api/v1/admin/service-types")

            app.dependency_overrides[get_current_actor] = lambda: customer
            owned_media_id = await upload_issue_media(client, collection_id=uuid4())
            app.dependency_overrides[get_current_actor] = lambda: other
            foreign_media_id = await upload_issue_media(client, collection_id=uuid4())

            app.dependency_overrides[get_current_actor] = lambda: customer
            created = await client.post(
                f"/api/v1/machines/{machine_id}/service-requests",
                json={
                    "service_type_id": configured.json()["id"],
                    "description": "The machine loses pressure during extraction.",
                    "location_mode": "bring_in",
                    "preferred_window": {
                        "start": "2026-09-02T09:00:00+03:00",
                        "end": "2026-09-02T12:00:00+03:00",
                    },
                    "media_ids": [owned_media_id],
                },
            )
            foreign_machine = await client.post(
                f"/api/v1/machines/{foreign_machine_id}/service-requests",
                json={
                    "service_type_id": configured.json()["id"],
                    "description": "This machine belongs to another customer.",
                    "location_mode": "bring_in",
                },
            )
            unsupported = await client.post(
                f"/api/v1/machines/{machine_id}/service-requests",
                json={
                    "service_type_id": unsupported_type.json()["id"],
                    "description": "This service does not support the selected model.",
                    "location_mode": "bring_in",
                },
            )
            foreign_media = await client.post(
                f"/api/v1/machines/{machine_id}/service-requests",
                json={
                    "service_type_id": configured.json()["id"],
                    "description": "This request references another owner's media.",
                    "location_mode": "bring_in",
                    "media_ids": [foreign_media_id],
                },
            )
            missing_pickup_address = await client.post(
                f"/api/v1/machines/{machine_id}/service-requests",
                json={
                    "service_type_id": configured.json()["id"],
                    "description": "Pickup without an address should be rejected.",
                    "location_mode": "pickup",
                },
            )

            app.dependency_overrides[get_current_actor] = lambda: admin
            updated_type = await client.patch(
                f"/api/v1/admin/service-types/{configured.json()['id']}",
                json={
                    "expected_version": configured.json()["version"],
                    "diagnostic_fee_agorot": 15_000,
                },
            )

            app.dependency_overrides[get_current_actor] = lambda: customer
            pickup = await client.post(
                f"/api/v1/machines/{machine_id}/service-requests",
                json={
                    "service_type_id": configured.json()["id"],
                    "description": "Please collect the machine from my saved address.",
                    "location_mode": "pickup",
                    "address_id": str(address_id),
                },
            )
            listed = await client.get("/api/v1/service-requests")
            machine_detail = await client.get(f"/api/v1/machines/{machine_id}")

        engine = create_async_engine(migrated_database_url)
        factory = async_sessionmaker(engine, expire_on_commit=False)
        try:
            async with factory() as session, session.begin():
                session.add_all(
                    [
                        ServiceNote(
                            request_id=UUID(created.json()["id"]),
                            author_id=admin.user_id,
                            visibility=ServiceNoteVisibility.INTERNAL,
                            body="Internal diagnosis context",
                        ),
                        ServiceNote(
                            request_id=UUID(created.json()["id"]),
                            author_id=admin.user_id,
                            visibility=ServiceNoteVisibility.CUSTOMER,
                            body="We will inspect the pressure system.",
                        ),
                    ]
                )
        finally:
            await engine.dispose()

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            app.dependency_overrides[get_current_actor] = lambda: customer
            detail = await client.get(f"/api/v1/service-requests/{created.json()['id']}")
            cancelled = await client.post(f"/api/v1/service-requests/{created.json()['id']}/cancel")
            repeated_cancel = await client.post(
                f"/api/v1/service-requests/{created.json()['id']}/cancel"
            )

            app.dependency_overrides[get_current_actor] = lambda: other
            hidden = await client.get(f"/api/v1/service-requests/{created.json()['id']}")
            hidden_cancel = await client.post(
                f"/api/v1/service-requests/{pickup.json()['id']}/cancel"
            )

    assert forbidden_config.status_code == 403
    assert configured.status_code == 201
    assert configured.json()["machine_model_ids"] == [str(model_id)]
    assert configured_list.status_code == 200
    assert len(configured_list.json()) == 2
    assert created.status_code == 201
    assert created.json()["state"] == "awaiting_diagnostic_payment"
    assert created.json()["diagnostic_fee_agorot"] == 12_500
    assert created.json()["address_snapshot"]["street"] == "Dizengoff"
    assert created.json()["preferred_window_start"] == "2026-09-02T09:00:00+03:00"
    assert created.json()["media"][0]["media_id"] == owned_media_id
    assert created.json()["allowed_actions"] == ["cancel", "pay_diagnostic"]
    assert len(created.json()["history"]) == 1
    assert foreign_machine.status_code == 404
    assert unsupported.status_code == 422
    assert unsupported.json()["code"] == "SERVICE_TYPE_NOT_AVAILABLE"
    assert foreign_media.status_code == 422
    assert foreign_media.json()["code"] == "SERVICE_MEDIA_NOT_AVAILABLE"
    assert missing_pickup_address.status_code == 422
    assert updated_type.status_code == 200
    assert updated_type.json()["diagnostic_fee_agorot"] == 15_000
    assert pickup.status_code == 201
    assert pickup.json()["diagnostic_fee_agorot"] == 15_000
    assert pickup.json()["address_snapshot"]["street"] == "הרצל"
    assert len(listed.json()) == 2
    assert {item["service_request_id"] for item in machine_detail.json()["service_history"]} == {
        created.json()["id"],
        pickup.json()["id"],
    }
    assert detail.json()["diagnostic_fee_agorot"] == 12_500
    assert [note["body"] for note in detail.json()["notes"]] == [
        "We will inspect the pressure system."
    ]
    assert cancelled.status_code == 200
    assert cancelled.json()["state"] == "cancelled"
    assert len(cancelled.json()["history"]) == 2
    assert cancelled.json()["allowed_actions"] == []
    assert repeated_cancel.status_code == 409
    assert repeated_cancel.json()["code"] == "SERVICE_TRANSITION_NOT_ALLOWED"
    assert hidden.status_code == 404
    assert hidden_cancel.status_code == 404

    engine = create_async_engine(migrated_database_url)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with factory() as session:
            event_count = await session.scalar(
                select(func.count(OutboxEvent.id)).where(
                    OutboxEvent.aggregate_id == UUID(created.json()["id"])
                )
            )
    finally:
        await engine.dispose()
    assert event_count == 2

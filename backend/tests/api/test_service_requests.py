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
from coffix.notifications.models import OutboxEvent
from coffix.service.models import (
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
            collection_id = uuid4()
            removable_id = await upload_issue_media(client, collection_id=collection_id)
            app.dependency_overrides[get_current_actor] = lambda: other
            assert (await client.delete(f"/api/v1/media/{removable_id}")).status_code == 404
            app.dependency_overrides[get_current_actor] = lambda: customer
            assert (await client.delete(f"/api/v1/media/{removable_id}")).status_code == 204
            assert (await client.get(f"/api/v1/media/{removable_id}/download")).status_code == 404
            owned_media_id = await upload_issue_media(client, collection_id=collection_id)
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
            assert (await client.delete(f"/api/v1/media/{owned_media_id}")).status_code == 409
            assert (await client.get(f"/api/v1/media/{owned_media_id}/download")).status_code == 200
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
            events = list(
                await session.scalars(
                    select(OutboxEvent).where(
                        OutboxEvent.aggregate_id == UUID(created.json()["id"])
                    )
                )
            )
            event_count = await session.scalar(
                select(func.count(OutboxEvent.id)).where(
                    OutboxEvent.aggregate_id == UUID(created.json()["id"])
                )
            )
    finally:
        await engine.dispose()
    assert event_count == 2
    assert all(event.payload["customer_id"] == str(customer.user_id) for event in events)


@pytest.mark.asyncio
async def test_customer_intake_options_are_owned_active_and_model_supported(
    migrated_database_url: str,
) -> None:
    customer, other, admin, machine_id, _, model_id, other_model_id, _ = await seed_service_api(
        migrated_database_url
    )
    app = create_app(Settings(app_env="test", database_url=migrated_database_url))
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            app.dependency_overrides[get_current_actor] = lambda: admin
            for label, models, active in [
                ("תיקון", [model_id], True),
                ("לא נתמך", [other_model_id], True),
                ("לא פעיל", [model_id], False),
            ]:
                response = await client.post(
                    "/api/v1/admin/service-types",
                    json={
                        "label_he": label,
                        "label_en": label,
                        "diagnostic_fee_agorot": 12500,
                        "machine_model_ids": [str(item) for item in models],
                        "is_active": active,
                    },
                )
                assert response.status_code == 201
            app.dependency_overrides[get_current_actor] = lambda: customer
            response = await client.get(f"/api/v1/machines/{machine_id}/service-options")
            assert response.status_code == 200
            options = response.json()
            assert [item["label_he"] for item in options["service_types"]] == ["תיקון"]
            assert options["service_types"][0]["diagnostic_fee_agorot"] == 12500
            assert options["shop_address"]["country"] == "IL"
            assert options["max_media_files"] == 5
            app.dependency_overrides[get_current_actor] = lambda: other
            assert (
                await client.get(f"/api/v1/machines/{machine_id}/service-options")
            ).status_code == 404


@pytest.mark.asyncio
@pytest.mark.parametrize("path", ["no_extra_cost", "paid_extra_cost", "declined_quote"])
async def test_local_mobile_service_flow_through_customer_commands(
    migrated_database_url: str,
    path: str,
) -> None:
    customer, _, admin, machine_id, _, model_id, _, _ = await seed_service_api(
        migrated_database_url
    )
    engine = create_async_engine(migrated_database_url)
    try:
        async with async_sessionmaker(engine)() as session, session.begin():
            technician = await UserRepository(session).create(
                phone_e164="+972501236604", role=Role.TECHNICIAN
            )
            technician_id = str(technician.id)
    finally:
        await engine.dispose()
    app = create_app(Settings(app_env="test", database_url=migrated_database_url))
    async with app.router.lifespan_context(app):
        app.state.clock = FakeClock(NOW)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            app.dependency_overrides[get_current_actor] = lambda: admin
            configured = await client.post(
                "/api/v1/admin/service-types",
                json={
                    "label_he": "תיקון",
                    "label_en": "Repair",
                    "diagnostic_fee_agorot": 12500,
                    "machine_model_ids": [str(model_id)],
                },
            )
            assert configured.status_code == 201
            app.dependency_overrides[get_current_actor] = lambda: customer
            options = await client.get(f"/api/v1/machines/{machine_id}/service-options")
            created = await client.post(
                f"/api/v1/machines/{machine_id}/service-requests",
                json={
                    "service_type_id": options.json()["service_types"][0]["id"],
                    "description": "The machine loses pressure during extraction.",
                    "location_mode": "bring_in",
                    "preferred_window": {
                        "start": "2026-09-08T08:00:00+03:00",
                        "end": "2026-09-08T12:00:00+03:00",
                    },
                },
            )
            assert created.status_code == 201
            request_id = created.json()["id"]
            customer_path = f"/api/v1/service-requests/{request_id}"
            admin_path = f"/api/v1/admin/service-requests/{request_id}"
            assert created.json()["allowed_actions"] == ["cancel", "pay_diagnostic"]
            assert created.json()["confirmed_appointment_start"] is None
            assert created.json()["diagnostic_fee_agorot"] == 12500
            assert (
                await client.post(admin_path + "/status", json={"action": "start_diagnosis"})
            ).status_code == 403
            app.dependency_overrides[get_current_actor] = lambda: admin
            appointment = {
                "technician_id": technician_id,
                "start": "2026-09-08T09:00:00+03:00",
                "end": "2026-09-08T11:00:00+03:00",
            }
            assert (
                await client.post(admin_path + "/appointment", json=appointment)
            ).status_code == 409
            app.dependency_overrides[get_current_actor] = lambda: customer

            async def pay(kind: str) -> None:
                key = f"mobile-service-{request_id}-{kind}"
                payment = await client.post(
                    customer_path + f"/{kind}-payment",
                    headers={
                        "Idempotency-Key": key,
                    },
                )
                assert payment.status_code == 201
                retried = await client.post(
                    customer_path + f"/{kind}-payment",
                    headers={
                        "Idempotency-Key": key,
                    },
                )
                assert retried.json()["payment_id"] == payment.json()["payment_id"]
                webhook = await client.post(
                    "/api/v1/test/payments/webhooks",
                    json={
                        "event_id": key,
                        "event_type": "payment_intent.succeeded",
                        "provider_object_id": payment.json()["provider_payment_id"],
                        "state": "confirmed",
                    },
                )
                assert webhook.status_code == 200

            await pay("diagnostic")
            assert (await client.post(customer_path + "/cancel")).status_code == 409
            assert (await client.get(customer_path)).json()["state"] == "awaiting_admin_review"
            app.dependency_overrides[get_current_actor] = lambda: admin
            assert (
                await client.post(admin_path + "/appointment", json=appointment)
            ).status_code == 200
            for action in ("receive", "start_diagnosis"):
                assert (
                    await client.post(admin_path + "/status", json={"action": action})
                ).status_code == 200
            if path == "no_extra_cost":
                repaired = await client.post(admin_path + "/no-cost-repair")
                assert repaired.json()["state"] == "repair_in_progress"
            else:
                quoted = await client.post(
                    admin_path + "/quote",
                    json={
                        "amount_agorot": 35000,
                        "explanation": "Pump replacement",
                    },
                )
                assert quoted.status_code == 200
                app.dependency_overrides[get_current_actor] = lambda: customer
                assert (
                    await client.post(
                        customer_path + "/additional-payment",
                        headers={
                            "Idempotency-Key": "premature-additional",
                        },
                    )
                ).status_code == 409
                decision = "accepted" if path == "paid_extra_cost" else "declined"
                decided = await client.post(
                    customer_path + "/quote-decision",
                    json={
                        "decision": decision,
                    },
                )
                assert decided.status_code == 200
                if decision == "accepted":
                    assert decided.json()["allowed_actions"] == ["pay_additional"]
                    app.dependency_overrides[get_current_actor] = lambda: admin
                    assert (await client.post(admin_path + "/no-cost-repair")).status_code == 409
                    app.dependency_overrides[get_current_actor] = lambda: customer
                    await pay("additional")
                else:
                    assert decided.json()["state"] == "cancelled"
                    assert decided.json()["allowed_actions"] == []
                    assert (
                        await client.post(
                            customer_path + "/additional-payment",
                            headers={
                                "Idempotency-Key": "declined-additional",
                            },
                        )
                    ).status_code == 409
            if path != "declined_quote":
                app.dependency_overrides[get_current_actor] = lambda: admin
                for action in ("ready_for_return", "complete"):
                    assert (
                        await client.post(admin_path + "/status", json={"action": action})
                    ).status_code == 200
            app.dependency_overrides[get_current_actor] = lambda: customer
            final = (await client.get(customer_path)).json()
            assert final["state"] == ("cancelled" if path == "declined_quote" else "completed")
            assert final["history"][-1]["to_state"] == final["state"]
            assert final["diagnostic_fee_agorot"] == 12500

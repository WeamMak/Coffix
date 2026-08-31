from datetime import UTC, datetime

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from coffix.api.app import create_app
from coffix.auth.policies import CurrentActor, get_current_actor
from coffix.catalog.repository import MachineModelRepository
from coffix.catalog.schemas import MachineModelCreate
from coffix.core.clock import FakeClock
from coffix.core.ids import UuidGenerator
from coffix.core.settings import Settings
from coffix.machines.repository import MachineRepository
from coffix.notifications.models import OutboxEvent
from coffix.service.models import ServiceLocationMode, ServiceRequestState
from coffix.service.repository import ServiceRepository
from coffix.service.schemas import ServiceRequestCreate
from coffix.service.service import ServiceRequestService
from coffix.users.models import Role
from coffix.users.repository import UserRepository

NOW = datetime(2026, 8, 31, 12, 0, tzinfo=UTC)
SHOP = {"street": "Dizengoff", "building": "1", "city": "Tel Aviv", "country": "IL"}


async def seed_admin_service(database_url: str):
    engine = create_async_engine(database_url)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with factory() as session, session.begin():
            users = UserRepository(session)
            customer = await users.create(phone_e164="+972501237101", role=Role.CUSTOMER)
            admin = await users.create(phone_e164="+972501237102", role=Role.ADMIN)
            technician = await users.create(phone_e164="+972501237103", role=Role.TECHNICIAN)
            model = await MachineModelRepository(session).create(
                MachineModelCreate(manufacturer="Coffix", model_name="Scheduling")
            )
            repository = ServiceRepository(session)
            service_type = await repository.create_service_type(
                label_he="תזמון",
                label_en="Scheduling",
                diagnostic_fee_agorot=7_500,
                is_active=True,
                machine_model_ids=[model.id],
            )
            requests = []
            for index in range(3):
                machine = await MachineRepository(session).create_manual_registration(
                    customer_id=customer.id,
                    machine_model_id=model.id,
                    serial_number=f"SCHEDULE-{index}",
                    purchase_date=None,
                )
                item = await ServiceRequestService(
                    repository,
                    clock=FakeClock(NOW),
                    ids=UuidGenerator(),
                    shop_address=SHOP,
                ).create(
                    customer.id,
                    machine.id,
                    ServiceRequestCreate(
                        service_type_id=service_type.id,
                        description="Machine requires a confirmed workshop appointment.",
                        location_mode=ServiceLocationMode.BRING_IN,
                    ),
                )
                requests.append(item)
            requests[0].state = ServiceRequestState.AWAITING_ADMIN_REVIEW
            requests[1].state = ServiceRequestState.AWAITING_ADMIN_REVIEW
            return (
                CurrentActor(customer.id, customer.role),
                CurrentActor(admin.id, admin.role),
                CurrentActor(technician.id, technician.role),
                [item.id for item in requests],
            )
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_admin_scheduling_allows_overlaps_only_after_diagnostic_payment(
    migrated_database_url: str,
) -> None:
    customer, admin, technician, request_ids = await seed_admin_service(migrated_database_url)
    app = create_app(Settings(app_env="test", database_url=migrated_database_url))
    async with app.router.lifespan_context(app):
        app.state.clock = FakeClock(NOW)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            payload = {
                "technician_id": str(technician.user_id),
                "start": "2026-09-01T09:00:00+03:00",
                "end": "2026-09-01T11:00:00+03:00",
            }
            app.dependency_overrides[get_current_actor] = lambda: customer
            forbidden = await client.post(
                f"/api/v1/admin/service-requests/{request_ids[0]}/appointment",
                json=payload,
            )

            app.dependency_overrides[get_current_actor] = lambda: admin
            first = await client.post(
                f"/api/v1/admin/service-requests/{request_ids[0]}/appointment",
                json=payload,
            )
            overlapping = await client.post(
                f"/api/v1/admin/service-requests/{request_ids[1]}/appointment",
                json={
                    **payload,
                    "start": "2026-09-01T10:00:00+03:00",
                    "end": "2026-09-01T12:00:00+03:00",
                },
            )
            unpaid = await client.post(
                f"/api/v1/admin/service-requests/{request_ids[2]}/appointment",
                json=payload,
            )
            premature_diagnosis = await client.post(
                f"/api/v1/admin/service-requests/{request_ids[2]}/status",
                json={"action": "start_diagnosis"},
            )

            app.dependency_overrides[get_current_actor] = lambda: customer
            diagnostic_payment = await client.post(
                f"/api/v1/service-requests/{request_ids[2]}/diagnostic-payment",
                headers={"Idempotency-Key": "admin-service-diagnostic-1"},
            )
            failed_diagnostic_webhook = await client.post(
                "/api/v1/test/payments/webhooks",
                json={
                    "event_id": "evt-admin-service-diagnostic-failed",
                    "event_type": "payment_intent.payment_failed",
                    "provider_object_id": diagnostic_payment.json()["provider_payment_id"],
                    "state": "failed",
                },
            )
            diagnostic_webhook = await client.post(
                "/api/v1/test/payments/webhooks",
                json={
                    "event_id": "evt-admin-service-diagnostic-1",
                    "event_type": "payment_intent.succeeded",
                    "provider_object_id": diagnostic_payment.json()["provider_payment_id"],
                    "state": "confirmed",
                },
            )
            app.dependency_overrides[get_current_actor] = lambda: admin
            paid_schedule = await client.post(
                f"/api/v1/admin/service-requests/{request_ids[2]}/appointment",
                json={
                    **payload,
                    "start": "2026-09-02T09:00:00+03:00",
                    "end": "2026-09-02T11:00:00+03:00",
                },
            )

    assert forbidden.status_code == 403
    assert first.status_code == 200
    assert first.json()["overlap_warnings"] == []
    assert first.json()["service_request"]["state"] == "scheduled"
    assert first.json()["service_request"]["assigned_technician_id"] == str(technician.user_id)
    assert overlapping.status_code == 200
    assert overlapping.json()["service_request"]["state"] == "scheduled"
    assert overlapping.json()["overlap_warnings"][0]["request_id"] == str(request_ids[0])
    assert unpaid.status_code == 409
    assert unpaid.json()["code"] == "SERVICE_TRANSITION_NOT_ALLOWED"
    assert premature_diagnosis.status_code == 409
    assert premature_diagnosis.json()["code"] == "SERVICE_TRANSITION_NOT_ALLOWED"
    assert diagnostic_payment.status_code == 201
    assert diagnostic_payment.json()["state"] == "pending"
    assert failed_diagnostic_webhook.json()["result"] == "processed"
    assert diagnostic_webhook.json()["result"] == "processed"
    assert paid_schedule.status_code == 200
    assert paid_schedule.json()["service_request"]["state"] == "scheduled"

    engine = create_async_engine(migrated_database_url)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with factory() as session:
            scheduled_event = await session.scalar(
                select(OutboxEvent).where(
                    OutboxEvent.aggregate_id == request_ids[0],
                    OutboxEvent.event_type == "service.request.scheduled",
                )
            )
            payment_failure_event = await session.scalar(
                select(OutboxEvent).where(
                    OutboxEvent.aggregate_id == request_ids[2],
                    OutboxEvent.event_type == "payment.diagnostic.failed",
                )
            )
    finally:
        await engine.dispose()
    assert scheduled_event is not None
    assert scheduled_event.payload["customer_id"] == str(customer.user_id)
    assert scheduled_event.payload["technician_id"] == str(technician.user_id)
    assert payment_failure_event is not None
    assert payment_failure_event.payload["customer_id"] == str(customer.user_id)

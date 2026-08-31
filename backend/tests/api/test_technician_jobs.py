from datetime import UTC, datetime, timedelta
from pathlib import Path
from urllib.parse import urlparse

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from coffix.api.app import create_app
from coffix.auth.policies import CurrentActor, get_current_actor
from coffix.catalog.repository import MachineModelRepository
from coffix.catalog.schemas import MachineModelCreate
from coffix.core.clock import FakeClock
from coffix.core.ids import UuidGenerator
from coffix.core.settings import Settings
from coffix.machines.repository import MachineRepository
from coffix.service.models import ServiceLocationMode, ServiceRequestState
from coffix.service.repository import ServiceRepository
from coffix.service.schemas import ServiceRequestCreate
from coffix.service.service import ServiceRequestService
from coffix.users.models import Role
from coffix.users.repository import UserRepository

NOW = datetime(2026, 8, 31, 12, 0, tzinfo=UTC)
SHOP = {"street": "Dizengoff", "building": "1", "city": "Tel Aviv", "country": "IL"}
JPEG = b"\xff\xd8\xff\xe0technician-photo"


async def seed_technician_jobs(database_url: str):
    engine = create_async_engine(database_url)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with factory() as session, session.begin():
            users = UserRepository(session)
            customer = await users.create(phone_e164="+972501237201", role=Role.CUSTOMER)
            admin = await users.create(phone_e164="+972501237202", role=Role.ADMIN)
            technician = await users.create(phone_e164="+972501237203", role=Role.TECHNICIAN)
            other_technician = await users.create(phone_e164="+972501237204", role=Role.TECHNICIAN)
            model = await MachineModelRepository(session).create(
                MachineModelCreate(manufacturer="Coffix", model_name="Technician Jobs")
            )
            repository = ServiceRepository(session)
            service_type = await repository.create_service_type(
                label_he="עבודת טכנאי",
                label_en="Technician job",
                diagnostic_fee_agorot=9_000,
                is_active=True,
                machine_model_ids=[model.id],
            )
            requests = []
            for index, assigned in enumerate((technician, other_technician)):
                machine = await MachineRepository(session).create_manual_registration(
                    customer_id=customer.id,
                    machine_model_id=model.id,
                    serial_number=f"TECH-JOB-{index}",
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
                        description="Assigned technician must inspect this machine.",
                        location_mode=ServiceLocationMode.BRING_IN,
                    ),
                )
                item.state = ServiceRequestState.SCHEDULED
                item.assigned_technician_id = assigned.id
                item.confirmed_appointment_start = NOW + timedelta(days=1, hours=index)
                item.confirmed_appointment_end = NOW + timedelta(days=1, hours=index + 1)
                requests.append(item)
            return (
                CurrentActor(admin.id, admin.role),
                CurrentActor(technician.id, technician.role),
                CurrentActor(other_technician.id, other_technician.role),
                [item.id for item in requests],
            )
    finally:
        await engine.dispose()


async def upload_job_media(client: AsyncClient, request_id) -> str:
    upload = await client.post(
        "/api/v1/media/uploads",
        json={
            "purpose": "service_diagnosis",
            "collection_id": str(request_id),
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
async def test_technician_sees_only_assigned_jobs_and_only_operational_actions(
    migrated_database_url: str,
    tmp_path: Path,
) -> None:
    admin, technician, _, request_ids = await seed_technician_jobs(migrated_database_url)
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
            app.dependency_overrides[get_current_actor] = lambda: technician
            listed = await client.get("/api/v1/technician/jobs")
            hidden = await client.get(f"/api/v1/technician/jobs/{request_ids[1]}")
            forbidden_complete = await client.post(
                f"/api/v1/technician/jobs/{request_ids[0]}/status",
                json={"action": "complete"},
            )
            received = await client.post(
                f"/api/v1/technician/jobs/{request_ids[0]}/status",
                json={"action": "receive"},
            )
            diagnosing = await client.post(
                f"/api/v1/technician/jobs/{request_ids[0]}/status",
                json={"action": "start_diagnosis"},
            )
            technician_repair = await client.post(
                f"/api/v1/technician/jobs/{request_ids[0]}/status",
                json={"action": "ready_for_return"},
            )
            note = await client.post(
                f"/api/v1/technician/jobs/{request_ids[0]}/notes",
                json={"body": "Pressure valve is worn."},
            )
            media_id = await upload_job_media(client, request_ids[0])
            media = await client.post(
                f"/api/v1/technician/jobs/{request_ids[0]}/media",
                json={"media_id": media_id},
            )

            app.dependency_overrides[get_current_actor] = lambda: admin
            repair = await client.post(
                f"/api/v1/admin/service-requests/{request_ids[0]}/no-cost-repair"
            )

            app.dependency_overrides[get_current_actor] = lambda: technician
            ready = await client.post(
                f"/api/v1/technician/jobs/{request_ids[0]}/status",
                json={"action": "ready_for_return"},
            )
            technician_complete = await client.post(
                f"/api/v1/technician/jobs/{request_ids[0]}/status",
                json={"action": "complete"},
            )

    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()] == [str(request_ids[0])]
    assert listed.json()[0]["allowed_actions"] == ["receive"]
    assert hidden.status_code == 404
    assert forbidden_complete.status_code == 409
    assert received.json()["state"] == "received"
    assert diagnosing.json()["state"] == "diagnosing"
    assert technician_repair.status_code == 409
    assert note.status_code == 201
    assert note.json()["visibility"] == "internal"
    assert media.status_code == 201
    assert media.json()["purpose"] == "diagnosis"
    assert repair.json()["state"] == "repair_in_progress"
    assert ready.json()["state"] == "ready_for_return"
    assert technician_complete.status_code == 409

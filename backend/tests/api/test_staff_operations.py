from datetime import timedelta
from uuid import UUID

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from test_admin import seed_admin_api
from test_technician_jobs import NOW, seed_technician_jobs, upload_job_media

from coffix.api.app import create_app
from coffix.auth.policies import CurrentActor, get_current_actor
from coffix.core.clock import FakeClock
from coffix.core.settings import Settings
from coffix.notifications.models import (
    DeliveryState,
    DevicePlatform,
    DeviceToken,
    Notification,
    NotificationDelivery,
    OutboxEvent,
)
from coffix.users.models import Role


@pytest.mark.asyncio
async def test_staff_detail_notes_and_assignment_remain_role_scoped(migrated_database_url: str):
    admin, technician, other, ids = await seed_technician_jobs(migrated_database_url)
    app = create_app(Settings(app_env="test", database_url=migrated_database_url))
    async with app.router.lifespan_context(app):
        app.state.clock = FakeClock(NOW)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            app.dependency_overrides[get_current_actor] = lambda: admin
            configuration = await client.get("/api/v1/admin/configuration")
            assert configuration.status_code == 200
            assert configuration.json()["service_types"][0]["label_en"] == "Technician job"
            detail = await client.get(f"/api/v1/admin/service-requests/{ids[0]}")
            assert detail.status_code == 200
            assert detail.json()["machine"]["serial_number"] == "TECH-JOB-0"
            assert detail.json()["customer"]["phone_e164"] == "+972501237201"
            assert "assign" in detail.json()["allowed_actions"]
            app.dependency_overrides[get_current_actor] = lambda: technician
            media_id = await upload_job_media(client, ids[0])
            assert (
                await client.post(
                    f"/api/v1/technician/jobs/{ids[0]}/media", json={"media_id": media_id}
                )
            ).status_code == 201
            app.dependency_overrides[get_current_actor] = lambda: admin
            for visibility in ("internal", "customer"):
                note = await client.post(
                    f"/api/v1/admin/service-requests/{ids[0]}/notes",
                    json={"body": f"A {visibility} note", "visibility": visibility},
                )
                assert note.status_code == 201
            customer = CurrentActor(UUID(detail.json()["customer"]["id"]), Role.CUSTOMER)
            app.dependency_overrides[get_current_actor] = lambda: customer
            visible = (await client.get(f"/api/v1/service-requests/{ids[0]}")).json()
            assert [note["body"] for note in visible["notes"]] == ["A customer note"]
            app.dependency_overrides[get_current_actor] = lambda: admin
            assigned = await client.post(
                f"/api/v1/admin/service-requests/{ids[0]}/assignment",
                json={
                    "technician_id": str(other.user_id),
                    "expected_technician_id": str(technician.user_id),
                    "reason": "Shift change",
                },
            )
            assert assigned.status_code == 200
            assert assigned.json()["assigned_technician_id"] == str(other.user_id)
            app.dependency_overrides[get_current_actor] = lambda: technician
            assert (await client.get(f"/api/v1/technician/jobs/{ids[0]}")).status_code == 404
            assert (await client.get(f"/api/v1/admin/service-requests/{ids[0]}")).status_code == 403
            assert (await client.get(f"/api/v1/media/{media_id}/download")).status_code == 404
            app.dependency_overrides[get_current_actor] = lambda: other
            job = await client.get(f"/api/v1/technician/jobs/{ids[0]}")
            assert job.status_code == 200
            assert job.json()["machine"]["serial_number"] == "TECH-JOB-0"
            assert job.json()["allowed_actions"] == ["receive"]
            assert len(job.json()["notes"]) == 2
            assert (await client.get(f"/api/v1/media/{media_id}/download")).status_code == 200


@pytest.mark.asyncio
async def test_dashboard_filters_and_manual_notification_retry(migrated_database_url: str):
    admin, customer, _, _ = await seed_admin_api(migrated_database_url)
    engine = create_async_engine(migrated_database_url)
    try:
        async with async_sessionmaker(engine)() as session, session.begin():
            token = DeviceToken(
                user_id=customer.user_id,
                token="fake-task27",
                platform=DevicePlatform.ANDROID,
                last_registered_at=NOW,
            )
            notification = Notification(
                recipient_id=customer.user_id,
                type="service.status",
                title_he="בדיקה",
                body_he="בדיקה",
                related_entity_type="service_request",
            )
            session.add_all([token, notification])
            await session.flush()
            delivery = NotificationDelivery(
                notification_id=notification.id,
                device_token_id=token.id,
                state=DeliveryState.DEAD_LETTER,
                attempt_count=5,
                last_error_code="TEMPORARY",
                next_attempt_at=NOW,
                dead_lettered_at=NOW,
            )
            session.add(delivery)
            session.add(
                OutboxEvent(
                    event_type="service.status",
                    aggregate_type="user",
                    aggregate_id=customer.user_id,
                    payload={},
                    available_at=NOW,
                    dead_lettered_at=NOW,
                    attempt_count=5,
                )
            )
            await session.flush()
            delivery_id = delivery.id
    finally:
        await engine.dispose()
    app = create_app(Settings(app_env="test", database_url=migrated_database_url))
    async with app.router.lifespan_context(app):
        app.state.clock = FakeClock(NOW)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            app.dependency_overrides[get_current_actor] = lambda: admin
            dashboard = (await client.get("/api/v1/admin/dashboard")).json()
            assert dashboard["product_revenue_agorot"] == 1000
            assert dashboard["open_services"] == 0
            assert dashboard["todays_appointments"] == []
            assert dashboard["failed_deliveries"] == 1
            assert dashboard["failed_outbox_events"] == 1
            failures = (await client.get("/api/v1/admin/notification-deliveries")).json()
            assert failures[0]["can_retry"] is True
            retry = await client.post(f"/api/v1/admin/notification-deliveries/{delivery_id}/retry")
            assert retry.status_code == 200
            assert retry.json()["state"] == "pending"
            assert retry.json()["attempt_count"] == 0
            assert (
                await client.post(f"/api/v1/admin/notification-deliveries/{delivery_id}/retry")
            ).status_code == 409
            audits = await client.get(
                "/api/v1/admin/audit-logs",
                params={"action": "notification.delivery_retried", "actor_id": str(admin.user_id)},
            )
            assert len(audits.json()) == 1
            assert (
                await client.get("/api/v1/admin/audit-logs", params={"action": "not.present"})
            ).json() == []
            assert (
                await client.get(
                    "/api/v1/admin/audit-logs",
                    params={"from_time": (NOW + timedelta(days=365)).isoformat()},
                )
            ).json() == []
            assert (
                await client.get("/api/v1/admin/users", params={"role": "technician"})
            ).json() == []
            app.dependency_overrides[get_current_actor] = lambda: customer
            assert (
                await client.post(f"/api/v1/admin/notification-deliveries/{delivery_id}/retry")
            ).status_code == 403

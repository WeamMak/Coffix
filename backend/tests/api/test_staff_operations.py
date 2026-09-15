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
            assert failures[0]["recipient_phone"] == "+972501000002"
            assert failures[0]["notification_title"] == "בדיקה"
            assert failures[0]["notification_body"] == "בדיקה"
            assert failures[0]["device_platform"] == "android"
            assert failures[0]["retry_unavailable_reason"] is None
            assert failures[0]["claimed_at"] is None
            assert failures[0]["updated_at"]
            assert "fake-task27" not in str(failures)
            retry = await client.post(f"/api/v1/admin/notification-deliveries/{delivery_id}/retry")
            assert retry.status_code == 200
            assert retry.json()["state"] == "pending"
            assert retry.json()["attempt_count"] == 0
            assert retry.json()["recipient_phone"] == "+972501000002"
            assert retry.json()["can_retry"] is False
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


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("active", "owned", "claimed", "reason"),
    [
        (False, True, False, "device_inactive"),
        (True, False, False, "device_owner_changed"),
        (True, True, True, "delivery_in_progress"),
        (True, True, False, None),
    ],
)
async def test_delivery_context_eligibility_and_permissions(
    migrated_database_url,
    active,
    owned,
    claimed,
    reason,
):
    from sqlalchemy import select

    from coffix.orders.models import Order
    from coffix.users.models import User

    admin, customer, _, _ = await seed_admin_api(migrated_database_url)
    engine = create_async_engine(migrated_database_url)
    try:
        async with async_sessionmaker(engine)() as session, session.begin():
            person = await session.get(User, customer.user_id)
            assert person is not None
            person.display_name = "נועה כהן"
            order = (await session.scalars(select(Order))).one()
            order_id = order.id
            token = DeviceToken(
                user_id=customer.user_id if owned else admin.user_id,
                token="private-device-token",
                platform=DevicePlatform.IOS,
                is_active=active,
                last_registered_at=NOW,
            )
            message = Notification(
                recipient_id=customer.user_id,
                type="order.status",
                title_he="ההזמנה מוכנה",
                body_he="אפשר לעקוב באפליקציה",
                related_entity_type="order",
                related_entity_id=order_id,
            )
            session.add_all([token, message])
            await session.flush()
            delivery = NotificationDelivery(
                notification_id=message.id,
                device_token_id=token.id,
                state=DeliveryState.RETRY,
                attempt_count=2,
                next_attempt_at=NOW,
                claimed_at=NOW if claimed else None,
                last_error_code="UNKNOWN_SAFE_CODE",
                provider_message_id="private-provider-id",
            )
            session.add(delivery)
            await session.flush()
            delivery_id = delivery.id
    finally:
        await engine.dispose()
    app = create_app(Settings(app_env="test", database_url=migrated_database_url))
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            app.dependency_overrides[get_current_actor] = lambda: admin
            response = await client.get("/api/v1/admin/notification-deliveries")
            row = response.json()[0]
            assert row["recipient_name"] == "נועה כהן"
            assert row["related_entity_reference"] == "CFX-ADMIN-1"
            assert row["related_entity_id"] == str(order_id)
            assert row["device_platform"] == "ios"
            assert row["retry_unavailable_reason"] == reason
            assert row["can_retry"] is (reason is None)
            assert "private-" not in response.text
            assert (
                await client.get("/api/v1/admin/notification-deliveries?page=2&limit=1")
            ).json() == []
            retry = await client.post(f"/api/v1/admin/notification-deliveries/{delivery_id}/retry")
            assert retry.status_code == (200 if reason is None else 409)
            for role in (Role.CUSTOMER, Role.TECHNICIAN):
                app.dependency_overrides[get_current_actor] = lambda: CurrentActor(
                    customer.user_id, role
                )
                for path in ("notification-deliveries", "audit-logs"):
                    assert (await client.get(f"/api/v1/admin/{path}")).status_code == 403
                assert (
                    await client.post(f"/api/v1/admin/notification-deliveries/{delivery_id}/retry")
                ).status_code == 403


@pytest.mark.asyncio
async def test_audit_human_context_search_missing_targets_dates_and_safe_values(
    migrated_database_url,
):
    from uuid import uuid4

    from sqlalchemy import select

    from coffix.notifications.models import AuditLog
    from coffix.orders.models import Order
    from coffix.users.models import User

    admin, customer, _, sku_id = await seed_admin_api(migrated_database_url)
    engine = create_async_engine(migrated_database_url)
    try:
        async with async_sessionmaker(engine)() as session, session.begin():
            person = await session.get(User, admin.user_id)
            assert person is not None
            person.display_name = "מנהלת החנות"
            target = await session.get(User, customer.user_id)
            assert target is not None
            target.display_name = "נועה כהן"
            order = (await session.scalars(select(Order))).one()
            for index, (kind, target_id) in enumerate(
                [
                    ("order", order.id),
                    ("user", customer.user_id),
                    ("product_sku", sku_id),
                    ("order", uuid4()),
                    ("unknown_record", uuid4()),
                    ("shop_settings", None),
                ]
            ):
                session.add(
                    AuditLog(
                        actor_id=admin.user_id if index < 4 else None,
                        action="example.changed",
                        target_type=kind,
                        target_id=target_id,
                        before={
                            "shipping_fee_agorot": 3000,
                            "nested": [
                                {
                                    "access_token": "private-token",
                                    "apiKey": "private-key",
                                    "pan": "private-card",
                                    "providerResponse": {"raw": "private-response"},
                                }
                            ],
                        },
                        after={
                            "shipping_fee_agorot": 4000,
                            "provider_payload": {"raw": "private-payload"},
                        },
                        request_metadata={"authorization": "private-auth", "safe": "ok"},
                        created_at=NOW + timedelta(minutes=index),
                    )
                )
    finally:
        await engine.dispose()
    app = create_app(Settings(app_env="test", database_url=migrated_database_url))
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            app.dependency_overrides[get_current_actor] = lambda: admin
            response = await client.get("/api/v1/admin/audit-logs")
            rows = response.json()
            assert len(rows) == 6
            assert rows[-1]["actor_name"] == "מנהלת החנות"
            assert rows[-1]["actor_phone"] == "+972501000001"
            assert rows[-1]["target_reference"] == "CFX-ADMIN-1"
            assert rows[-2]["target_label"] == "נועה כהן"
            assert rows[-3]["target_reference"] == "ADMIN-STOCK"
            assert rows[2]["target_label"] is None
            assert rows[1]["target_label"] is None
            assert rows[0]["target_label"] == "הגדרות החנות"
            assert rows[0]["actor_name"] is None
            assert "private-" not in response.text
            assert rows[0]["before"]["shipping_fee_agorot"] == 3000
            for q in ("CFX-ADMIN", "נועה", "+972501000002", "ADMIN-STOCK", "הגדרות החנות"):
                found = await client.get("/api/v1/admin/audit-logs", params={"q": q})
                assert len(found.json()) == 1
            assert (await client.get("/api/v1/admin/audit-logs?q=%25")).json() == []
            assert (
                await client.get("/api/v1/admin/audit-logs", params={"q": "x" * 161})
            ).status_code == 422
            page1 = (await client.get("/api/v1/admin/audit-logs?limit=2")).json()
            page2 = (await client.get("/api/v1/admin/audit-logs?limit=2&page=2")).json()
            assert {x["id"] for x in page1}.isdisjoint(x["id"] for x in page2)
            period = {
                "from_time": NOW.isoformat(),
                "to_time": (NOW + timedelta(minutes=1)).isoformat(),
            }
            assert [
                r["id"]
                for r in (await client.get("/api/v1/admin/audit-logs", params=period)).json()
            ] == [rows[-1]["id"]]
            assert (
                await client.get(
                    "/api/v1/admin/audit-logs",
                    params={"from_time": NOW.isoformat(), "to_time": NOW.isoformat()},
                )
            ).status_code == 422
            assert (
                await client.get("/api/v1/admin/audit-logs?from_time=2026-09-01T12:00")
            ).status_code == 422
            # Searches and projections do not alter the stored event exposed by a later read.
            assert (await client.get("/api/v1/admin/audit-logs")).json() == rows


@pytest.mark.asyncio
async def test_service_delivery_and_audit_share_the_human_service_reference(migrated_database_url):
    from coffix.notifications.models import AuditLog
    from coffix.service.models import ServiceRequest

    admin, _, _, ids = await seed_technician_jobs(migrated_database_url)
    engine = create_async_engine(migrated_database_url)
    try:
        async with async_sessionmaker(engine)() as session, session.begin():
            service = await session.get(ServiceRequest, ids[0])
            assert service is not None
            reference = service.reference
            token = DeviceToken(
                user_id=service.customer_id,
                token="private-service-token",
                platform=DevicePlatform.ANDROID,
                last_registered_at=NOW,
            )
            message = Notification(
                recipient_id=service.customer_id,
                type="service.status",
                title_he="בקשת השירות עודכנה",
                body_he="המכונה התקבלה בחנות",
                related_entity_type="service_request",
                related_entity_id=ids[0],
            )
            session.add_all([token, message])
            await session.flush()
            session.add(
                NotificationDelivery(
                    notification_id=message.id,
                    device_token_id=token.id,
                    state=DeliveryState.RETRY,
                    attempt_count=1,
                    next_attempt_at=NOW,
                )
            )
            session.add(
                AuditLog(
                    actor_id=admin.user_id,
                    action="service.note_added",
                    target_type="service_request",
                    target_id=ids[0],
                    before=None,
                    after={"body": "תיעוד בטוח", "access_token": "private-legacy-token"},
                )
            )
    finally:
        await engine.dispose()
    app = create_app(Settings(app_env="test", database_url=migrated_database_url))
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            app.dependency_overrides[get_current_actor] = lambda: admin
            deliveries = (await client.get("/api/v1/admin/notification-deliveries")).json()
            assert deliveries[0]["related_entity_reference"] == reference
            assert deliveries[0]["notification_body"] == "המכונה התקבלה בחנות"
            audit = (await client.get("/api/v1/admin/audit-logs", params={"q": reference})).json()[
                0
            ]
            assert audit["target_label"] == reference
            assert audit["target_reference"] == reference
            assert audit["before"] is None
            assert audit["after"] == {"body": "תיעוד בטוח", "access_token": "[REDACTED]"}
    # The read projection must not persist its redactions over the original event.
    engine = create_async_engine(migrated_database_url)
    try:
        from sqlalchemy import select

        async with async_sessionmaker(engine)() as session:
            stored = (await session.scalars(select(AuditLog))).one()
            assert stored.after == {"body": "תיעוד בטוח", "access_token": "private-legacy-token"}
    finally:
        await engine.dispose()

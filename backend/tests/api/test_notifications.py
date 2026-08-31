from datetime import UTC, datetime

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from coffix.api.app import create_app
from coffix.auth.policies import CurrentActor, get_current_actor
from coffix.core.clock import FakeClock
from coffix.core.settings import Settings
from coffix.notifications.models import Notification
from coffix.users.models import Role
from coffix.users.repository import UserRepository

NOW = datetime(2026, 8, 31, 18, 0, tzinfo=UTC)


async def seed_notifications(
    database_url: str,
) -> tuple[CurrentActor, CurrentActor, Notification, Notification, Notification]:
    engine = create_async_engine(database_url)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with factory() as session, session.begin():
            users = UserRepository(session)
            owner = await users.create(phone_e164="+972501235701", role=Role.CUSTOMER)
            other = await users.create(phone_e164="+972501235702", role=Role.CUSTOMER)
            own_unread = Notification(
                event_id=None,
                recipient_id=owner.id,
                type="order.shipped",
                title_he="ההזמנה נשלחה",
                body_he="ההזמנה יצאה למשלוח.",
                related_entity_type="order",
                related_entity_id=None,
            )
            own_read = Notification(
                event_id=None,
                recipient_id=owner.id,
                type="order.paid",
                title_he="ההזמנה שולמה",
                body_he="התשלום התקבל.",
                related_entity_type="order",
                related_entity_id=None,
                read_at=NOW,
            )
            hidden = Notification(
                event_id=None,
                recipient_id=other.id,
                type="service.request.completed",
                title_he="בקשת השירות הושלמה",
                body_he="בקשת השירות הושלמה.",
                related_entity_type="service_request",
                related_entity_id=None,
            )
            session.add_all([own_unread, own_read, hidden])
            await session.flush()
            return (
                CurrentActor(owner.id, owner.role),
                CurrentActor(other.id, other.role),
                own_unread,
                own_read,
                hidden,
            )
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_notification_api_enforces_ownership_unread_counts_and_mandatory_delivery(
    migrated_database_url: str,
) -> None:
    owner, other, own_unread, own_read, hidden = await seed_notifications(
        migrated_database_url
    )
    app = create_app(Settings(app_env="test", database_url=migrated_database_url))

    async with app.router.lifespan_context(app):
        app.state.clock = FakeClock(NOW)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            unauthenticated = await client.get("/api/v1/notifications")
            app.dependency_overrides[get_current_actor] = lambda: owner
            listed = await client.get("/api/v1/notifications")
            unread = await client.get("/api/v1/notifications/unread-count")
            marked = await client.post(f"/api/v1/notifications/{own_unread.id}/read")
            marked_again = await client.post(f"/api/v1/notifications/{own_unread.id}/read")
            hidden_mark = await client.post(f"/api/v1/notifications/{hidden.id}/read")
            after_read = await client.get("/api/v1/notifications/unread-count")

            registered = await client.post(
                "/api/v1/notifications/device-tokens",
                json={"token": "device-token-owner", "platform": "android"},
            )
            repeated = await client.post(
                "/api/v1/notifications/device-tokens",
                json={"token": "device-token-owner", "platform": "android"},
            )
            opt_out = await client.post(
                "/api/v1/notifications/device-tokens",
                json={
                    "token": "device-token-owner",
                    "platform": "android",
                    "is_active": False,
                },
            )

            app.dependency_overrides[get_current_actor] = lambda: other
            other_list = await client.get("/api/v1/notifications")

    assert unauthenticated.status_code == 401
    assert listed.status_code == 200
    assert {item["id"] for item in listed.json()} == {str(own_unread.id), str(own_read.id)}
    assert unread.json() == {"unread_count": 1}
    assert marked.status_code == 200
    assert marked.json()["read_at"] == NOW.isoformat().replace("+00:00", "Z")
    assert marked_again.json()["read_at"] == marked.json()["read_at"]
    assert hidden_mark.status_code == 404
    assert hidden_mark.json()["code"] == "NOTIFICATION_NOT_FOUND"
    assert after_read.json() == {"unread_count": 0}
    assert registered.status_code == 201
    assert registered.json()["is_active"] is True
    assert repeated.status_code == 201
    assert repeated.json()["id"] == registered.json()["id"]
    assert opt_out.status_code == 422
    assert {item["id"] for item in other_list.json()} == {str(hidden.id)}

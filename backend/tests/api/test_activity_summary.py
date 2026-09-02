from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from coffix.api.app import create_app
from coffix.auth.policies import CurrentActor, get_current_actor
from coffix.core.settings import Settings
from coffix.seed import SEED_IDS, seed_database
from coffix.users.models import Role, User


@pytest.mark.asyncio
async def test_activity_summary_requires_authentication_and_returns_latest_active_records(
    migrated_database_url: str,
) -> None:
    settings = Settings(app_env="test", database_url=migrated_database_url)
    await seed_database(settings)
    app = create_app(settings)

    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            unauthenticated = await client.get("/api/v1/users/me/activity-summary")
            app.dependency_overrides[get_current_actor] = lambda: CurrentActor(
                user_id=SEED_IDS["user:customer"], role=Role.CUSTOMER
            )
            response = await client.get("/api/v1/users/me/activity-summary")

    assert unauthenticated.status_code == 401
    assert response.status_code == 200
    body = response.json()
    assert body["customer_id"] == str(SEED_IDS["user:customer"])
    assert body["display_name"] == "Demo Customer"
    assert body["active_order"]["order_number"] == "CFX-DEMO-004"
    assert body["active_order"]["state"] == "shipped"
    assert UUID(body["active_order"]["id"])
    assert body["active_service_request"]["reference"] == "SR-DEMO-009"
    assert body["active_service_request"]["state"] == "ready_for_return"
    assert UUID(body["active_service_request"]["id"])


@pytest.mark.asyncio
async def test_activity_summary_returns_empty_state_for_another_customer(
    migrated_database_url: str,
) -> None:
    settings = Settings(app_env="test", database_url=migrated_database_url)
    await seed_database(settings)
    customer_id = uuid4()
    engine = create_async_engine(migrated_database_url)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with factory() as session, session.begin():
            session.add(
                User(
                    id=customer_id,
                    phone_e164="+972500001999",
                    role=Role.CUSTOMER,
                    display_name=None,
                )
            )
    finally:
        await engine.dispose()

    app = create_app(settings)
    app.dependency_overrides[get_current_actor] = lambda: CurrentActor(
        user_id=customer_id, role=Role.CUSTOMER
    )
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/v1/users/me/activity-summary")

    assert response.status_code == 200
    assert response.json() == {
        "customer_id": str(customer_id),
        "display_name": None,
        "active_order": None,
        "active_service_request": None,
    }

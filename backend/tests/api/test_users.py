from uuid import UUID

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from coffix.api.app import create_app
from coffix.auth.policies import CurrentActor, get_current_actor
from coffix.core.settings import Settings
from coffix.users.models import Role
from coffix.users.repository import UserRepository


async def create_customer(database_url: str, phone_e164: str) -> CurrentActor:
    engine = create_async_engine(database_url)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with factory() as session, session.begin():
            user = await UserRepository(session).create(
                phone_e164=phone_e164,
                role=Role.CUSTOMER,
            )
            return CurrentActor(user_id=user.id, role=user.role)
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_customer_can_manage_owned_addresses(migrated_database_url: str) -> None:
    actor = await create_customer(migrated_database_url, "+972501234567")
    app = create_app(Settings(app_env="test", database_url=migrated_database_url))
    app.dependency_overrides[get_current_actor] = lambda: actor

    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            created = await client.post(
                "/api/v1/users/me/addresses",
                json={
                    "recipient_name": "ישראל ישראלי",
                    "phone": "050-123-4567",
                    "street": "דיזנגוף",
                    "building": "1",
                    "city": "תל אביב",
                    "is_default": True,
                },
            )
            address_id = UUID(created.json()["id"])

            listed = await client.get("/api/v1/users/me/addresses")
            updated = await client.patch(
                f"/api/v1/users/me/addresses/{address_id}",
                json={"street": "הרצל"},
            )
            fetched = await client.get(f"/api/v1/users/me/addresses/{address_id}")
            deleted = await client.delete(f"/api/v1/users/me/addresses/{address_id}")
            missing = await client.get(f"/api/v1/users/me/addresses/{address_id}")

    assert created.status_code == 201
    assert created.json()["phone_e164"] == "+972501234567"
    assert len(listed.json()) == 1
    assert updated.json()["street"] == "הרצל"
    assert fetched.json()["street"] == "הרצל"
    assert deleted.status_code == 204
    assert missing.status_code == 404


@pytest.mark.asyncio
async def test_customer_cannot_discover_another_customers_address(
    migrated_database_url: str,
) -> None:
    owner = await create_customer(migrated_database_url, "+972501234567")
    other_customer = await create_customer(migrated_database_url, "+972502345678")
    app = create_app(Settings(app_env="test", database_url=migrated_database_url))
    app.dependency_overrides[get_current_actor] = lambda: owner

    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            created = await client.post(
                "/api/v1/users/me/addresses",
                json={
                    "recipient_name": "ישראל ישראלי",
                    "phone": "0501234567",
                    "street": "דיזנגוף",
                    "building": "1",
                    "city": "תל אביב",
                },
            )
            address_id = created.json()["id"]
            app.dependency_overrides[get_current_actor] = lambda: other_customer
            response = await client.get(f"/api/v1/users/me/addresses/{address_id}")

    assert response.status_code == 404
    assert response.json()["code"] == "not_found"

import pytest
from httpx import ASGITransport, AsyncClient

from coffix.api.app import create_app
from coffix.auth.policies import CurrentActor, get_current_actor
from coffix.core.settings import Settings
from coffix.users.models import Role
from coffix.users.repository import UserRepository


@pytest.mark.asyncio
async def test_profile_is_authenticated_and_always_uses_the_current_customer(
    migrated_database_url: str,
):
    app = create_app(Settings(app_env="test", database_url=migrated_database_url))
    async with app.router.lifespan_context(app):
        async with app.state.session_factory() as session, session.begin():
            customer = await UserRepository(session).create(
                phone_e164="+972501238901", role=Role.CUSTOMER
            )
            customer.display_name = "מאיה"
            actor = CurrentActor(customer.id, customer.role)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            assert (await client.get("/api/v1/users/me")).status_code == 401
            app.dependency_overrides[get_current_actor] = lambda: actor
            result = await client.get("/api/v1/users/me?user_id=someone-else")
            assert result.status_code == 200
            assert result.json() == {
                "id": str(actor.user_id),
                "display_name": "מאיה",
                "email": None,
                "profile_complete": True,
                "phone_e164": "+972501238901",
                "role": "customer",
                "is_active": True,
            }


@pytest.mark.asyncio
async def test_first_login_requires_name_and_persists_only_owned_personal_details(
    migrated_database_url: str,
):
    from test_auth import auth_client, login

    async for client in auth_client(migrated_database_url):
        tokens = await login(client, "0501234567")
        client.headers["Authorization"] = f"Bearer {tokens['access_token']}"
        profile = (await client.get("/api/v1/users/me")).json()
        assert profile["profile_complete"] is False
        assert (await client.get("/api/v1/users/me/addresses")).status_code == 403
        for payload in (
            {"display_name": "   "},
            {"display_name": "מאיה", "email": "invalid"},
            {"display_name": "מאיה", "role": "admin"},
            {"display_name": "מאיה", "phone_e164": "+972509999999"},
            {"display_name": "מאיה", "user_id": "someone-else"},
        ):
            assert (await client.patch("/api/v1/users/me", json=payload)).status_code == 422
        saved = await client.patch("/api/v1/users/me", json={"display_name": "  מאיה לוי  "})
        assert saved.status_code == 200
        assert saved.json()["display_name"] == "מאיה לוי"
        assert saved.json()["profile_complete"] is True
        assert saved.json()["email"] is None
        assert (await client.get("/api/v1/users/me/addresses")).status_code == 200
        updated = await client.patch(
            "/api/v1/users/me", json={"display_name": "מאיה", "email": "maya@example.com"}
        )
        assert updated.json()["email"] == "maya@example.com"
        assert (await client.get("/api/v1/users/me")).json() == updated.json()
        cleared = await client.patch(
            "/api/v1/users/me", json={"display_name": "מאיה", "email": None}
        )
        assert cleared.json()["email"] is None
        other = await login(client, "0502345678")
        client.headers["Authorization"] = f"Bearer {other['access_token']}"
        assert (await client.get("/api/v1/users/me")).json()["display_name"] is None


@pytest.mark.asyncio
@pytest.mark.parametrize("configured", [False, True])
async def test_app_information_exposes_only_configured_public_details(configured: bool):
    from uuid import uuid4

    settings = Settings(
        app_env="test",
        shop_phone="+97231234567" if configured else None,
        shop_whatsapp="+972501234567" if configured else None,
        shop_hours="א–ה 09:00–17:00" if configured else None,
        privacy_policy_url="https://shop.example/privacy" if configured else None,
        service_terms_url="https://shop.example/terms" if configured else None,
        shop_address_json='{"city":"חיפה","street":"הרצל","building":"12","internal":"secret"}',
    )
    app = create_app(settings)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            assert (await client.get("/api/v1/app-info")).status_code == 401
            app.dependency_overrides[get_current_actor] = lambda: CurrentActor(
                uuid4(), Role.CUSTOMER
            )
            result = await client.get("/api/v1/app-info")
            assert result.status_code == 200
            assert result.json() == {
                "phone": settings.shop_phone,
                "whatsapp": settings.shop_whatsapp,
                "opening_hours": settings.shop_hours,
                "privacy_policy_url": str(settings.privacy_policy_url) if configured else None,
                "service_terms_url": str(settings.service_terms_url) if configured else None,
                "address": {
                    "city": "חיפה",
                    "street": "הרצל",
                    "building": "12",
                    "postal_code": None,
                    "country": "IL",
                },
            }

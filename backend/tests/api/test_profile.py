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
                "phone_e164": "+972501238901",
                "role": "customer",
                "is_active": True,
            }

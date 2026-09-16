"""A successful create response must be immediately usable by the next app request."""

import json
from datetime import UTC, datetime

import pytest
from httpx import ASGITransport, AsyncClient

from coffix.api.app import create_app
from coffix.auth.policies import CurrentActor, get_current_actor
from coffix.core.clock import FakeClock
from coffix.core.settings import Settings
from coffix.machines.models import MachineModel, MachineSource, RegisteredMachine
from coffix.service.models import ServiceType, ServiceTypeMachineModel
from coffix.users.models import Role, User


@pytest.mark.asyncio
@pytest.mark.parametrize("resource", ["machine", "service"])
async def test_created_resource_is_readable_when_success_is_sent(
    migrated_database_url: str,
    resource: str,
) -> None:
    app = create_app(Settings(app_env="test", database_url=migrated_database_url))
    visible_at_response = []
    async with app.router.lifespan_context(app):
        app.state.clock = FakeClock(datetime(2026, 1, 5, 10, tzinfo=UTC))
        async with app.state.session_factory() as session, session.begin():
            customer = User(phone_e164="+972501230032", role=Role.CUSTOMER, is_active=True)
            model = MachineModel(manufacturer="E2E", model_name="Visibility", is_active=True)
            service_type = ServiceType(
                label_he="תיקון", label_en="Repair", diagnostic_fee_agorot=10000, is_active=True
            )
            session.add_all([customer, model, service_type])
            await session.flush()
            machine = RegisteredMachine(
                customer_id=customer.id,
                machine_model_id=model.id,
                serial_number="VISIBLE-1",
                source=MachineSource.MANUAL,
            )
            session.add_all(
                [
                    machine,
                    ServiceTypeMachineModel(
                        service_type_id=service_type.id, machine_model_id=model.id
                    ),
                ]
            )
            await session.flush()
        app.dependency_overrides[get_current_actor] = lambda: CurrentActor(
            customer.id, Role.CUSTOMER
        )
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as reader:

            async def observe_response(scope, receive, send):
                async def observe(message):
                    if message["type"] == "http.response.body" and message.get("body"):
                        body = json.loads(message["body"])
                        if "id" in body:
                            prefix = "/machines" if resource == "machine" else "/service-requests"
                            result = await reader.get(f"/api/v1{prefix}/{body['id']}")
                            visible_at_response.append(result.status_code)
                    await send(message)

                await app(scope, receive, observe)

            async with AsyncClient(
                transport=ASGITransport(app=observe_response), base_url="http://test"
            ) as client:
                response = await client.post(
                    "/api/v1/machines"
                    if resource == "machine"
                    else f"/api/v1/machines/{machine.id}/service-requests",
                    json={"machine_model_id": str(model.id), "serial_number": "VISIBLE-2"}
                    if resource == "machine"
                    else {
                        "service_type_id": str(service_type.id),
                        "description": "המכונה אינה מחממת מים",
                        "location_mode": "bring_in",
                    },
                )
                assert response.status_code == 201, response.text
    assert visible_at_response == [200]


@pytest.mark.asyncio
async def test_profile_is_complete_when_save_success_is_sent(migrated_database_url: str) -> None:
    app = create_app(Settings(app_env="test", database_url=migrated_database_url))
    visible_at_response = []
    async with app.router.lifespan_context(app):
        async with app.state.session_factory() as session, session.begin():
            customer = User(phone_e164="+972501230033", role=Role.CUSTOMER, is_active=True)
            session.add(customer)
            await session.flush()
        app.dependency_overrides[get_current_actor] = lambda: CurrentActor(
            customer.id, Role.CUSTOMER
        )
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as reader:

            async def observe_response(scope, receive, send):
                async def observe(message):
                    if message["type"] == "http.response.body" and message.get("body"):
                        result = await reader.get("/api/v1/users/me")
                        visible_at_response.append(result.json()["profile_complete"])
                    await send(message)

                await app(scope, receive, observe)

            async with AsyncClient(
                transport=ASGITransport(app=observe_response), base_url="http://test"
            ) as client:
                response = await client.patch(
                    "/api/v1/users/me", json={"display_name": "לקוח בדיקה"}
                )
                assert response.status_code == 200
    assert visible_at_response == [True]


@pytest.mark.asyncio
async def test_otp_session_is_usable_when_tokens_are_sent(migrated_database_url: str) -> None:
    from test_auth import MemoryRateLimiter

    app = create_app(Settings(app_env="test", database_url=migrated_database_url))
    visible_at_response = []
    async with app.router.lifespan_context(app):
        app.state.clock = FakeClock(datetime(2026, 1, 5, 10, tzinfo=UTC))
        app.state.rate_limiter = MemoryRateLimiter()
        await app.state.otp_provider.request_code("+972501230032")
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as reader:

            async def observe_response(scope, receive, send):
                async def observe(message):
                    if message["type"] == "http.response.body" and message.get("body"):
                        body = json.loads(message["body"])
                        if "access_token" in body:
                            result = await reader.get(
                                "/api/v1/users/me",
                                headers={
                                    "Authorization": f"Bearer {body['access_token']}",
                                },
                            )
                            visible_at_response.append(result.status_code)
                    await send(message)

                await app(scope, receive, observe)

            async with AsyncClient(
                transport=ASGITransport(app=observe_response), base_url="http://test"
            ) as client:
                result = await client.post(
                    "/api/v1/auth/otp/verify", json={"phone": "0501230032", "code": "123456"}
                )
                assert result.status_code == 200, result.text
    assert visible_at_response == [200]

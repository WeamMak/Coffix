from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from test_auth import MemoryRateLimiter, auth_settings

from coffix.api.app import create_app
from coffix.auth.router import get_rate_limiter
from coffix.users.models import Role
from coffix.users.repository import UserRepository

ORIGIN = "http://localhost:5173"
HEADERS = {"Origin": ORIGIN, "X-CSRF-Protection": "1"}
PREFIX = "/api/v1/auth/web"
COOKIE = "coffix_web_refresh"


@asynccontextmanager
async def web_client(database_url: str, role: Role) -> AsyncIterator[AsyncClient]:
    engine = create_async_engine(database_url)
    try:
        async with async_sessionmaker(engine)() as session, session.begin():
            await UserRepository(session).create(phone_e164="+972501234567", role=role)
    finally:
        await engine.dispose()
    app = create_app(auth_settings(database_url))
    limiter = MemoryRateLimiter()
    app.dependency_overrides[get_rate_limiter] = lambda: limiter
    async with app.router.lifespan_context(app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="https://test", headers=HEADERS
        ) as client:
            yield client


async def web_login(client: AsyncClient):
    requested = await client.post(f"{PREFIX}/otp/request", json={"phone": "0501234567"})
    assert requested.status_code == 202
    return await client.post(
        f"{PREFIX}/otp/verify", json={"phone": "0501234567", "code": "123456"}
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("role", [Role.ADMIN, Role.TECHNICIAN])
async def test_staff_login_cookie_rotation_and_logout(migrated_database_url: str, role: Role):
    async with web_client(migrated_database_url, role) as client:
        logged_in = await web_login(client)
        assert logged_in.status_code == 200
        assert logged_in.json()["role"] == role.value
        assert "refresh_token" not in logged_in.json()
        cookie = logged_in.headers["set-cookie"]
        assert "HttpOnly" in cookie and "Secure" in cookie and "SameSite=strict" in cookie
        assert f"Path={PREFIX}" in cookie and "Domain=" not in cookie
        assert logged_in.headers["cache-control"] == "no-store"
        original = client.cookies.get(COOKIE)
        refreshed = await client.post(f"{PREFIX}/refresh")
        assert refreshed.status_code == 200
        assert client.cookies.get(COOKIE) != original
        assert "refresh_token" not in refreshed.json()
        token = refreshed.json()["access_token"]
        dashboard = await client.get(
            "/api/v1/admin/dashboard", headers={"Authorization": f"Bearer {token}"}
        )
        assert dashboard.status_code == (200 if role == Role.ADMIN else 403)
        assert (await client.post(f"{PREFIX}/logout")).status_code == 204
        assert client.cookies.get(COOKIE) is None
        assert (await client.post(f"{PREFIX}/refresh")).status_code == 401
        assert (await client.post(f"{PREFIX}/logout")).status_code == 204
        denied = await client.get(
            "/api/v1/admin/dashboard", headers={"Authorization": f"Bearer {token}"}
        )
        assert denied.status_code == 401


@pytest.mark.asyncio
async def test_customer_and_unknown_phone_cannot_enter_web_dashboard(migrated_database_url: str):
    async with web_client(migrated_database_url, Role.CUSTOMER) as client:
        denied = await web_login(client)
        assert denied.status_code == 403
        assert denied.json()["code"] == "staff_required"
        assert "set-cookie" not in denied.headers
        await client.post(f"{PREFIX}/otp/request", json={"phone": "0502345678"})
        unknown = await client.post(
            f"{PREFIX}/otp/verify", json={"phone": "0502345678", "code": "123456"}
        )
        assert unknown.status_code == 403
        assert client.cookies.get(COOKIE) is None
        # Fake OTP is single use, so request a fresh code through the native flow.
        client_app_phone = "0503456789"
        await client.post("/api/v1/auth/otp/request", json={"phone": client_app_phone})
        native = await client.post(
            "/api/v1/auth/otp/verify", json={"phone": client_app_phone, "code": "123456"}
        )
        assert native.status_code == 200
        assert "refresh_token" in native.json()
        assert "set-cookie" not in native.headers


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"Origin": "null", "X-CSRF-Protection": "1"},
        {"Origin": "https://evil.example", "X-CSRF-Protection": "1"},
        {"Origin": ORIGIN + ".evil.example", "X-CSRF-Protection": "1"},
        {"Origin": ORIGIN},
        {**HEADERS, "Sec-Fetch-Site": "cross-site"},
    ],
)
async def test_web_commands_reject_csrf_without_rotating_or_revoking_cookie(
    migrated_database_url: str, headers: dict[str, str]
):
    async with web_client(migrated_database_url, Role.ADMIN) as client:
        assert (await web_login(client)).status_code == 200
        original = client.cookies.get(COOKIE)
        client.headers.clear()
        client.headers.update(headers)
        for endpoint in ("otp/request", "otp/verify", "refresh", "logout"):
            denied = await client.post(
                f"{PREFIX}/{endpoint}", json={"phone": "0501234567", "code": "123456"}
            )
            assert denied.status_code == 403
            assert denied.json()["code"] == "web_origin_denied"
        assert client.cookies.get(COOKIE) == original
        client.headers.clear()
        client.headers.update(HEADERS)
        assert (await client.post(f"{PREFIX}/refresh")).status_code == 200


@pytest.mark.asyncio
async def test_cors_allows_only_dashboard_credentials(migrated_database_url: str):
    async with web_client(migrated_database_url, Role.ADMIN) as client:
        for origin, expected in ((ORIGIN, 200), ("https://evil.example", 400)):
            response = await client.options(
                f"{PREFIX}/refresh",
                headers={
                    "Origin": origin,
                    "Access-Control-Request-Method": "POST",
                    "Access-Control-Request-Headers": "X-CSRF-Protection,Content-Type",
                },
            )
            assert response.status_code == expected
            if expected == 200:
                assert response.headers["access-control-allow-origin"] == ORIGIN
                assert response.headers["access-control-allow-credentials"] == "true"
            else:
                assert "access-control-allow-origin" not in response.headers


@pytest.mark.asyncio
async def test_web_refresh_replay_revokes_session(migrated_database_url: str):
    async with web_client(migrated_database_url, Role.ADMIN) as client:
        assert (await web_login(client)).status_code == 200
        original = client.cookies.get(COOKIE)
        rotated = await client.post(f"{PREFIX}/refresh")
        replayed = await client.post(
            f"{PREFIX}/refresh", headers={"Cookie": f"{COOKIE}={original}"}
        )
        assert replayed.status_code == 401
        assert replayed.json()["code"] == "refresh_token_reused"
        assert (await client.post(f"{PREFIX}/refresh")).status_code == 401
        denied = await client.get(
            "/api/v1/admin/dashboard",
            headers={"Authorization": f"Bearer {rotated.json()['access_token']}"},
        )
        assert denied.status_code == 401

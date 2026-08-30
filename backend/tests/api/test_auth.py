from collections.abc import AsyncIterator

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from httpx import ASGITransport, AsyncClient

from coffix.api.app import create_app
from coffix.auth.router import get_rate_limiter
from coffix.core.settings import Settings


class MemoryRateLimiter:
    def __init__(self) -> None:
        self.counts: dict[str, int] = {}
        self.cooldowns: set[str] = set()

    async def allow(self, key: str, *, limit: int, window_seconds: int) -> bool:
        del window_seconds
        self.counts[key] = self.counts.get(key, 0) + 1
        return self.counts[key] <= limit

    async def acquire(self, key: str, *, ttl_seconds: int) -> bool:
        del ttl_seconds
        if key in self.cooldowns:
            return False
        self.cooldowns.add(key)
        return True


def auth_settings(database_url: str) -> Settings:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = private_key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    public_pem = private_key.public_key().public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()
    return Settings(
        app_env="test",
        database_url=database_url,
        jwt_private_key=private_pem,
        jwt_public_key=public_pem,
    )


async def auth_client(database_url: str) -> AsyncIterator[AsyncClient]:
    app = create_app(auth_settings(database_url))
    app.dependency_overrides[get_rate_limiter] = lambda: MemoryRateLimiter()
    async with app.router.lifespan_context(app):
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            yield client


async def login(client: AsyncClient, phone: str) -> dict[str, str]:
    requested = await client.post(
        "/api/v1/auth/otp/request",
        json={"phone": phone},
        headers={"X-Device-ID": "device-a"},
    )
    assert requested.status_code == 202
    verified = await client.post(
        "/api/v1/auth/otp/verify",
        json={"phone": phone, "code": "123456"},
        headers={"X-Device-ID": "device-a"},
    )
    assert verified.status_code == 200
    return verified.json()


@pytest.mark.asyncio
async def test_otp_login_returns_generic_response_and_usable_customer_session(
    migrated_database_url: str,
) -> None:
    async for client in auth_client(migrated_database_url):
        first = await client.post(
            "/api/v1/auth/otp/request",
            json={"phone": "0501234567"},
            headers={"X-Device-ID": "device-a"},
        )
        second = await client.post(
            "/api/v1/auth/otp/request",
            json={"phone": "0502345678"},
            headers={"X-Device-ID": "device-b"},
        )
        invalid_code = await client.post(
            "/api/v1/auth/otp/verify",
            json={"phone": "0501234567", "code": "12345"},
        )
        verified = await client.post(
            "/api/v1/auth/otp/verify",
            json={"phone": "0501234567", "code": "123456"},
            headers={"X-Device-ID": "device-a"},
        )
        tokens = verified.json()
        addresses = await client.get(
            "/api/v1/users/me/addresses",
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
        )

    assert first.status_code == 202
    assert first.json() == second.json() == {
        "message": "If the phone number is eligible, a verification code was sent."
    }
    assert invalid_code.status_code == 422
    assert verified.status_code == 200
    assert tokens["token_type"] == "bearer"
    assert addresses.status_code == 200
    assert addresses.json() == []


@pytest.mark.asyncio
async def test_refresh_rotation_reuse_detection_and_logout(
    migrated_database_url: str,
) -> None:
    async for client in auth_client(migrated_database_url):
        original = await login(client, "0501234567")
        rotated = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": original["refresh_token"]},
        )
        reused = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": original["refresh_token"]},
        )
        revoked = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": rotated.json()["refresh_token"]},
        )

        other = await login(client, "0502345678")
        logged_out = await client.post(
            "/api/v1/auth/logout",
            json={"refresh_token": other["refresh_token"]},
        )
        logged_out_again = await client.post(
            "/api/v1/auth/logout",
            json={"refresh_token": other["refresh_token"]},
        )
        access_after_logout = await client.get(
            "/api/v1/users/me/addresses",
            headers={"Authorization": f"Bearer {other['access_token']}"},
        )
        after_logout = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": other["refresh_token"]},
        )

    assert rotated.status_code == 200
    assert rotated.json()["refresh_token"] != original["refresh_token"]
    assert reused.status_code == 401
    assert reused.json()["code"] == "refresh_token_reused"
    assert revoked.status_code == 401
    assert revoked.json()["code"] == "session_revoked"
    assert logged_out.status_code == 204
    assert logged_out_again.status_code == 204
    assert access_after_logout.status_code == 401
    assert after_logout.status_code == 401
    assert after_logout.json()["code"] == "session_revoked"

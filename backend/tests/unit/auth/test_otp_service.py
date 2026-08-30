from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from coffix.api.errors import ApiError
from coffix.auth.adapters.fake import FakeOtpProvider
from coffix.auth.service import AuthService, RequestSignals
from coffix.auth.tokens import hash_token, parse_refresh_token
from coffix.core.clock import FakeClock
from coffix.core.settings import Settings
from coffix.users.models import Role


@dataclass
class StoredUser:
    id: UUID
    phone_e164: str
    role: Role
    is_active: bool = True


@dataclass
class StoredSession:
    id: UUID
    user_id: UUID
    refresh_token_hash: str
    expires_at: datetime
    revoked_at: datetime | None = None
    device_metadata: dict[str, str] | None = None


class MemoryUsers:
    def __init__(self, users: list[StoredUser] | None = None) -> None:
        self.users = {user.phone_e164: user for user in users or []}

    async def get_by_phone(self, phone_e164: str) -> StoredUser | None:
        return self.users.get(phone_e164)

    async def get(self, user_id: UUID) -> StoredUser | None:
        return next((user for user in self.users.values() if user.id == user_id), None)

    async def create(
        self,
        *,
        phone_e164: str,
        role: Role,
        display_name: str | None = None,
    ) -> StoredUser:
        del display_name
        user = StoredUser(
            id=UUID(f"00000000-0000-4000-8000-{len(self.users) + 1:012d}"),
            phone_e164=phone_e164,
            role=role,
        )
        self.users[phone_e164] = user
        return user


class MemorySessions:
    def __init__(self) -> None:
        self.sessions: dict[UUID, StoredSession] = {}
        self.commits = 0

    async def create(
        self,
        *,
        session_id: UUID,
        user_id: UUID,
        refresh_token_hash: str,
        expires_at: datetime,
        device_metadata: dict[str, str] | None,
    ) -> StoredSession:
        session = StoredSession(
            id=session_id,
            user_id=user_id,
            refresh_token_hash=refresh_token_hash,
            expires_at=expires_at,
            device_metadata=device_metadata,
        )
        self.sessions[session_id] = session
        return session

    async def get_for_update(self, session_id: UUID) -> StoredSession | None:
        return self.sessions.get(session_id)

    async def flush(self) -> None:
        return None

    async def commit(self) -> None:
        self.commits += 1


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


class SequenceIds:
    def __init__(self) -> None:
        self.value = 0

    def new(self) -> UUID:
        self.value += 1
        return UUID(f"10000000-0000-4000-8000-{self.value:012d}")


@pytest.fixture
def auth_settings() -> Settings:
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
        jwt_private_key=private_pem,
        jwt_public_key=public_pem,
        otp_request_phone_limit=2,
        otp_request_ip_limit=3,
        otp_verify_phone_limit=2,
        otp_verify_ip_limit=3,
    )


def build_service(
    auth_settings: Settings,
    *,
    users: MemoryUsers | None = None,
    sessions: MemorySessions | None = None,
    limiter: MemoryRateLimiter | None = None,
) -> tuple[AuthService, MemoryUsers, MemorySessions, MemoryRateLimiter, FakeOtpProvider]:
    user_store = users or MemoryUsers()
    session_store = sessions or MemorySessions()
    rate_limiter = limiter or MemoryRateLimiter()
    provider = FakeOtpProvider("123456")
    service = AuthService(
        users=user_store,
        sessions=session_store,
        otp_provider=provider,
        rate_limiter=rate_limiter,
        clock=FakeClock(datetime(2026, 1, 2, 10, 0, tzinfo=UTC)),
        ids=SequenceIds(),
        settings=auth_settings,
    )
    return service, user_store, session_store, rate_limiter, provider


@pytest.mark.asyncio
async def test_otp_request_is_generic_and_enforces_resend_cooldown(
    auth_settings: Settings,
) -> None:
    service, _, _, _, provider = build_service(auth_settings)
    signals = RequestSignals(ip_address="192.0.2.10", device_signal="device-a")

    assert await service.request_otp("050-123-4567", signals) is None
    assert provider.requested_phones == ["+972501234567"]

    with pytest.raises(ApiError) as error:
        await service.request_otp("050-123-4567", signals)

    assert error.value.status == 429
    assert error.value.code == "otp_resend_cooldown"


@pytest.mark.asyncio
async def test_otp_request_limits_phone_and_ip_independently(auth_settings: Settings) -> None:
    service, _, _, limiter, _ = build_service(auth_settings)

    limiter.counts[service.phone_rate_key("request", "+972501234567")] = 2
    with pytest.raises(ApiError) as phone_error:
        await service.request_otp(
            "0501234567",
            RequestSignals(ip_address="192.0.2.10", device_signal="device-a"),
        )
    assert phone_error.value.code == "otp_rate_limited"

    service, _, _, limiter, _ = build_service(auth_settings)
    limiter.counts[service.ip_rate_key("request", "192.0.2.10")] = 3
    with pytest.raises(ApiError) as ip_error:
        await service.request_otp(
            "0501234567",
            RequestSignals(ip_address="192.0.2.10", device_signal="device-a"),
        )
    assert ip_error.value.code == "otp_rate_limited"


@pytest.mark.asyncio
async def test_otp_verification_attempts_are_rate_limited(auth_settings: Settings) -> None:
    service, _, _, _, _ = build_service(auth_settings)
    signals = RequestSignals(ip_address="192.0.2.10", device_signal="device-a")
    await service.request_otp("0501234567", signals)

    for _ in range(2):
        with pytest.raises(ApiError) as invalid_error:
            await service.verify_otp("0501234567", "000000", signals)
        assert invalid_error.value.code == "otp_invalid"

    with pytest.raises(ApiError) as limited_error:
        await service.verify_otp("0501234567", "000000", signals)
    assert limited_error.value.code == "otp_rate_limited"


@pytest.mark.asyncio
async def test_verified_new_phone_is_created_as_customer_only(auth_settings: Settings) -> None:
    service, users, _, _, _ = build_service(auth_settings)
    signals = RequestSignals(ip_address="192.0.2.10", device_signal="device-a")
    await service.request_otp("0501234567", signals)

    tokens = await service.verify_otp("0501234567", "123456", signals)

    assert users.users["+972501234567"].role is Role.CUSTOMER
    assert tokens.access_token
    assert parse_refresh_token(tokens.refresh_token)


@pytest.mark.asyncio
async def test_existing_staff_role_is_preserved_and_inactive_user_is_rejected(
    auth_settings: Settings,
) -> None:
    admin = StoredUser(
        id=UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
        phone_e164="+972501234567",
        role=Role.ADMIN,
    )
    service, users, _, _, _ = build_service(auth_settings, users=MemoryUsers([admin]))
    signals = RequestSignals(ip_address="192.0.2.10", device_signal="device-a")
    await service.request_otp(admin.phone_e164, signals)

    await service.verify_otp(admin.phone_e164, "123456", signals)
    assert users.users[admin.phone_e164].role is Role.ADMIN

    admin.is_active = False
    with pytest.raises(ApiError) as error:
        await service.verify_otp(admin.phone_e164, "123456", signals)
    assert error.value.code == "account_inactive"


@pytest.mark.asyncio
async def test_refresh_rotates_and_reuse_revokes_the_family(auth_settings: Settings) -> None:
    service, _, sessions, _, _ = build_service(auth_settings)
    signals = RequestSignals(ip_address="192.0.2.10", device_signal="device-a")
    await service.request_otp("0501234567", signals)
    original = await service.verify_otp("0501234567", "123456", signals)

    rotated = await service.refresh(original.refresh_token)

    session_id = parse_refresh_token(original.refresh_token)
    assert rotated.refresh_token != original.refresh_token
    assert sessions.sessions[session_id].refresh_token_hash == hash_token(
        rotated.refresh_token
    )

    with pytest.raises(ApiError) as reuse_error:
        await service.refresh(original.refresh_token)

    assert reuse_error.value.code == "refresh_token_reused"
    assert sessions.sessions[session_id].revoked_at is not None
    assert sessions.commits == 1

    with pytest.raises(ApiError) as revoked_error:
        await service.refresh(rotated.refresh_token)
    assert revoked_error.value.code == "session_revoked"


@pytest.mark.asyncio
async def test_logout_revokes_current_session(auth_settings: Settings) -> None:
    service, _, sessions, _, _ = build_service(auth_settings)
    signals = RequestSignals(ip_address="192.0.2.10", device_signal="device-a")
    await service.request_otp("0501234567", signals)
    tokens = await service.verify_otp("0501234567", "123456", signals)

    await service.logout(tokens.refresh_token)

    assert sessions.sessions[parse_refresh_token(tokens.refresh_token)].revoked_at is not None
    with pytest.raises(ApiError, match="revoked"):
        await service.refresh(tokens.refresh_token)

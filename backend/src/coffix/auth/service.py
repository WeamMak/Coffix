from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from hashlib import sha256
from hmac import compare_digest
from typing import Protocol
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from coffix.api.errors import ApiError
from coffix.auth.models import AuthSession
from coffix.auth.providers import OtpProvider
from coffix.auth.schemas import AuthTokens
from coffix.auth.tokens import (
    create_access_token,
    create_refresh_token,
    hash_token,
    parse_refresh_token,
)
from coffix.core.clock import Clock
from coffix.core.ids import IdGenerator
from coffix.core.rate_limit import RateLimiter
from coffix.core.settings import Settings
from coffix.users.models import Role
from coffix.users.service import normalize_israeli_phone

SIX_DIGIT_CODE = re.compile(r"^\d{6}$")


class UserRecord(Protocol):
    id: UUID
    phone_e164: str
    role: Role
    is_active: bool


class UserStore(Protocol):
    async def get_by_phone(self, phone_e164: str) -> UserRecord | None: ...

    async def get(self, user_id: UUID) -> UserRecord | None: ...

    async def create(
        self,
        *,
        phone_e164: str,
        role: Role,
        display_name: str | None = None,
    ) -> UserRecord: ...


class SessionRecord(Protocol):
    id: UUID
    user_id: UUID
    refresh_token_hash: str
    expires_at: datetime
    revoked_at: datetime | None
    device_metadata: dict[str, str] | None


class SessionStore(Protocol):
    async def create(
        self,
        *,
        session_id: UUID,
        user_id: UUID,
        refresh_token_hash: str,
        expires_at: datetime,
        device_metadata: dict[str, str] | None,
    ) -> SessionRecord: ...

    async def get_for_update(self, session_id: UUID) -> SessionRecord | None: ...

    async def flush(self) -> None: ...

    async def commit(self) -> None: ...


class SessionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(
        self,
        *,
        session_id: UUID,
        user_id: UUID,
        refresh_token_hash: str,
        expires_at: datetime,
        device_metadata: dict[str, str] | None,
    ) -> AuthSession:
        record = AuthSession(
            id=session_id,
            user_id=user_id,
            refresh_token_hash=refresh_token_hash,
            expires_at=expires_at,
            device_metadata=device_metadata,
        )
        self.session.add(record)
        await self.session.flush()
        return record

    async def get_for_update(self, session_id: UUID) -> AuthSession | None:
        return await self.session.scalar(
            select(AuthSession).where(AuthSession.id == session_id).with_for_update()
        )

    async def flush(self) -> None:
        await self.session.flush()

    async def commit(self) -> None:
        await self.session.commit()


@dataclass(frozen=True, slots=True)
class RequestSignals:
    ip_address: str
    device_signal: str | None = None


class AuthService:
    def __init__(
        self,
        *,
        users: UserStore,
        sessions: SessionStore,
        otp_provider: OtpProvider,
        rate_limiter: RateLimiter,
        clock: Clock,
        ids: IdGenerator,
        settings: Settings,
    ) -> None:
        self.users = users
        self.sessions = sessions
        self.otp_provider = otp_provider
        self.rate_limiter = rate_limiter
        self.clock = clock
        self.ids = ids
        self.settings = settings

    @staticmethod
    def _digest(value: str) -> str:
        return sha256(value.encode()).hexdigest()

    def phone_rate_key(self, action: str, phone_e164: str) -> str:
        return f"auth:otp:{action}:phone:{self._digest(phone_e164)}"

    def ip_rate_key(self, action: str, ip_address: str) -> str:
        return f"auth:otp:{action}:ip:{self._digest(ip_address)}"

    def device_rate_key(self, action: str, device_signal: str) -> str:
        return f"auth:otp:{action}:device:{self._digest(device_signal)}"

    async def request_otp(self, raw_phone: str, signals: RequestSignals) -> None:
        phone_e164 = self._normalize_phone(raw_phone)
        await self._enforce_attempt_limits("request", phone_e164, signals)
        cooldown_key = f"auth:otp:cooldown:{self._digest(phone_e164)}"
        if not await self.rate_limiter.acquire(
            cooldown_key,
            ttl_seconds=self.settings.otp_resend_cooldown_seconds,
        ):
            raise ApiError(
                status=429,
                code="otp_resend_cooldown",
                title="Please wait before requesting another code",
            )
        await self.otp_provider.request_code(phone_e164)

    async def verify_otp(
        self,
        raw_phone: str,
        code: str,
        signals: RequestSignals,
    ) -> AuthTokens:
        phone_e164 = self._normalize_phone(raw_phone)
        if not SIX_DIGIT_CODE.fullmatch(code):
            raise ApiError(status=422, code="validation_error", title="Invalid OTP code")
        await self._enforce_attempt_limits("verify", phone_e164, signals)
        if not await self.otp_provider.verify_code(phone_e164, code):
            raise ApiError(status=401, code="otp_invalid", title="Invalid or expired code")

        user = await self.users.get_by_phone(phone_e164)
        if user is None:
            user = await self.users.create(phone_e164=phone_e164, role=Role.CUSTOMER)
        if not user.is_active:
            raise ApiError(status=403, code="account_inactive", title="Account is inactive")
        return await self._create_session(user, signals)

    async def refresh(self, refresh_token: str) -> AuthTokens:
        session_id = self._parse_refresh_token(refresh_token)
        session = await self.sessions.get_for_update(session_id)
        if session is None:
            raise ApiError(status=401, code="refresh_token_invalid", title="Invalid session")
        if session.revoked_at is not None:
            raise ApiError(status=401, code="session_revoked", title="Session is revoked")

        now = self.clock.now()
        if now >= session.expires_at:
            raise ApiError(status=401, code="refresh_token_expired", title="Session expired")
        if not compare_digest(session.refresh_token_hash, hash_token(refresh_token)):
            session.revoked_at = now
            await self.sessions.flush()
            await self.sessions.commit()
            raise ApiError(
                status=401,
                code="refresh_token_reused",
                title="Refresh token reuse detected; session revoked",
            )

        user = await self.users.get(session.user_id)
        if user is None:
            raise ApiError(status=401, code="refresh_token_invalid", title="Invalid session")
        if not user.is_active:
            raise ApiError(status=403, code="account_inactive", title="Account is inactive")

        rotated = create_refresh_token(session.id)
        session.refresh_token_hash = hash_token(rotated)
        await self.sessions.flush()
        return self._tokens(user, session, rotated)

    async def logout(self, refresh_token: str) -> None:
        try:
            session_id = parse_refresh_token(refresh_token)
        except ValueError:
            return
        session = await self.sessions.get_for_update(session_id)
        if session is None or session.revoked_at is not None:
            return
        if not compare_digest(session.refresh_token_hash, hash_token(refresh_token)):
            return
        session.revoked_at = self.clock.now()
        await self.sessions.flush()

    async def _create_session(
        self,
        user: UserRecord,
        signals: RequestSignals,
    ) -> AuthTokens:
        session_id = self.ids.new()
        refresh_token = create_refresh_token(session_id)
        session = await self.sessions.create(
            session_id=session_id,
            user_id=user.id,
            refresh_token_hash=hash_token(refresh_token),
            expires_at=self.clock.now() + timedelta(days=self.settings.refresh_token_ttl_days),
            device_metadata=(
                {"device_signal": signals.device_signal} if signals.device_signal else None
            ),
        )
        return self._tokens(user, session, refresh_token)

    def _tokens(
        self,
        user: UserRecord,
        session: SessionRecord,
        refresh_token: str,
    ) -> AuthTokens:
        return AuthTokens(
            access_token=create_access_token(
                user_id=user.id,
                session_id=session.id,
                role=user.role,
                now=self.clock.now(),
                ttl=timedelta(minutes=self.settings.access_token_ttl_minutes),
                private_key=self.settings.jwt_private_key,
            ),
            refresh_token=refresh_token,
        )

    async def _enforce_attempt_limits(
        self,
        action: str,
        phone_e164: str,
        signals: RequestSignals,
    ) -> None:
        if action == "request":
            phone_limit = self.settings.otp_request_phone_limit
            signal_limit = self.settings.otp_request_ip_limit
        else:
            phone_limit = self.settings.otp_verify_phone_limit
            signal_limit = self.settings.otp_verify_ip_limit

        checks = [
            (self.phone_rate_key(action, phone_e164), phone_limit),
            (self.ip_rate_key(action, signals.ip_address), signal_limit),
        ]
        if signals.device_signal:
            checks.append((self.device_rate_key(action, signals.device_signal), signal_limit))

        for key, limit in checks:
            if not await self.rate_limiter.allow(
                key,
                limit=limit,
                window_seconds=self.settings.otp_rate_limit_window_seconds,
            ):
                raise ApiError(
                    status=429,
                    code="otp_rate_limited",
                    title="Too many authentication attempts",
                )

    @staticmethod
    def _normalize_phone(raw_phone: str) -> str:
        try:
            return normalize_israeli_phone(raw_phone)
        except ValueError as exc:
            raise ApiError(status=422, code="invalid_phone", title="Invalid phone number") from exc

    @staticmethod
    def _parse_refresh_token(refresh_token: str) -> UUID:
        try:
            return parse_refresh_token(refresh_token)
        except ValueError as exc:
            raise ApiError(
                status=401,
                code="refresh_token_invalid",
                title="Invalid session",
            ) from exc

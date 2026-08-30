from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from hashlib import sha256
from secrets import token_urlsafe
from uuid import UUID

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from coffix.core.settings import (
    LOCAL_DEVELOPMENT_PRIVATE_KEY,
    LOCAL_DEVELOPMENT_PUBLIC_KEY,
)
from coffix.users.models import Role

ACCESS_TOKEN_ALGORITHM = "RS256"
ACCESS_TOKEN_AUDIENCE = "coffix-api"
ACCESS_TOKEN_ISSUER = "coffix"


class AccessTokenError(ValueError):
    """Raised when an access token cannot be trusted."""


@dataclass(frozen=True, slots=True)
class AccessTokenClaims:
    user_id: UUID
    session_id: UUID
    role: Role
    expires_at: datetime


@lru_cache(maxsize=1)
def _development_key_pair() -> tuple[str, str]:
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
    return private_pem, public_pem


def _signing_key(configured_key: str) -> str:
    if configured_key == LOCAL_DEVELOPMENT_PRIVATE_KEY:
        return _development_key_pair()[0]
    return configured_key


def _verification_key(configured_key: str) -> str:
    if configured_key == LOCAL_DEVELOPMENT_PUBLIC_KEY:
        return _development_key_pair()[1]
    return configured_key


def hash_token(token: str) -> str:
    return sha256(token.encode("utf-8")).hexdigest()


def create_access_token(
    *,
    user_id: UUID,
    session_id: UUID,
    role: Role,
    now: datetime,
    ttl: timedelta,
    private_key: str,
) -> str:
    expires_at = now + ttl
    return jwt.encode(
        {
            "sub": str(user_id),
            "sid": str(session_id),
            "role": role.value,
            "iat": now,
            "exp": expires_at,
            "iss": ACCESS_TOKEN_ISSUER,
            "aud": ACCESS_TOKEN_AUDIENCE,
        },
        _signing_key(private_key),
        algorithm=ACCESS_TOKEN_ALGORITHM,
    )


def decode_access_token(
    token: str,
    *,
    public_key: str,
    now: datetime,
) -> AccessTokenClaims:
    try:
        payload = jwt.decode(
            token,
            _verification_key(public_key),
            algorithms=[ACCESS_TOKEN_ALGORITHM],
            audience=ACCESS_TOKEN_AUDIENCE,
            issuer=ACCESS_TOKEN_ISSUER,
            options={"verify_exp": False},
        )
        expires_at = datetime.fromtimestamp(int(payload["exp"]), tz=UTC)
        if now >= expires_at:
            raise AccessTokenError("Access token expired")
        return AccessTokenClaims(
            user_id=UUID(payload["sub"]),
            session_id=UUID(payload["sid"]),
            role=Role(payload["role"]),
            expires_at=expires_at,
        )
    except AccessTokenError:
        raise
    except (KeyError, TypeError, ValueError, jwt.PyJWTError) as exc:
        raise AccessTokenError("Invalid access token") from exc


def create_refresh_token(session_id: UUID, *, secret: str | None = None) -> str:
    return f"{session_id}.{secret or token_urlsafe(32)}"


def parse_refresh_token(token: str) -> UUID:
    try:
        session_id, secret = token.split(".", maxsplit=1)
        if not secret:
            raise ValueError
        return UUID(session_id)
    except (AttributeError, ValueError) as exc:
        raise ValueError("Invalid refresh token") from exc

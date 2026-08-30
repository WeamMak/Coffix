from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from coffix.auth.tokens import (
    AccessTokenError,
    create_access_token,
    create_refresh_token,
    decode_access_token,
    hash_token,
    parse_refresh_token,
)
from coffix.core.settings import Settings
from coffix.users.models import Role


@pytest.fixture
def rsa_keys() -> tuple[str, str]:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    public_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()
    return private_pem, public_pem


def test_access_token_round_trip_and_expiry(rsa_keys: tuple[str, str]) -> None:
    private_key, public_key = rsa_keys
    now = datetime(2026, 1, 2, 10, 0, tzinfo=UTC)
    user_id = UUID("11111111-1111-4111-8111-111111111111")
    session_id = UUID("22222222-2222-4222-8222-222222222222")

    token = create_access_token(
        user_id=user_id,
        session_id=session_id,
        role=Role.ADMIN,
        now=now,
        ttl=timedelta(minutes=15),
        private_key=private_key,
    )
    claims = decode_access_token(token, public_key=public_key, now=now)

    assert claims.user_id == user_id
    assert claims.session_id == session_id
    assert claims.role is Role.ADMIN
    assert claims.expires_at == now + timedelta(minutes=15)

    with pytest.raises(AccessTokenError, match="expired"):
        decode_access_token(
            token,
            public_key=public_key,
            now=now + timedelta(minutes=15, seconds=1),
        )


def test_refresh_token_is_opaque_but_identifies_its_session() -> None:
    session_id = UUID("33333333-3333-4333-8333-333333333333")

    refresh_token = create_refresh_token(session_id, secret="known-random-secret")

    assert refresh_token == f"{session_id}.known-random-secret"
    assert parse_refresh_token(refresh_token) == session_id
    assert hash_token(refresh_token) != refresh_token
    assert len(hash_token(refresh_token)) == 64

    with pytest.raises(ValueError, match="refresh token"):
        parse_refresh_token("not-a-refresh-token")


def test_local_development_signing_placeholders_use_an_ephemeral_rsa_pair() -> None:
    settings = Settings(app_env="test")
    now = datetime(2026, 1, 2, 10, 0, tzinfo=UTC)

    token = create_access_token(
        user_id=UUID("11111111-1111-4111-8111-111111111111"),
        session_id=UUID("22222222-2222-4222-8222-222222222222"),
        role=Role.CUSTOMER,
        now=now,
        ttl=timedelta(minutes=15),
        private_key=settings.jwt_private_key,
    )

    assert decode_access_token(
        token,
        public_key=settings.jwt_public_key,
        now=now,
    ).role is Role.CUSTOMER

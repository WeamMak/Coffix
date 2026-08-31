import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from pydantic import ValidationError

from coffix.core.settings import OtpProvider, Settings


def test_production_rejects_fake_otp_provider() -> None:
    with pytest.raises(ValidationError, match="fake OTP"):
        Settings(app_env="prod", otp_provider="fake", otp_dev_code=None)


def test_production_rejects_development_otp_code() -> None:
    with pytest.raises(ValidationError, match="OTP_DEV_CODE"):
        Settings(
            app_env="prod",
            otp_provider="twilio",
            otp_dev_code="123456",
            twilio_account_sid="account",
            twilio_auth_token="token",
            twilio_verify_service_sid="service",
        )


def test_real_provider_credentials_do_not_enable_real_calls() -> None:
    settings = Settings(
        otp_provider="fake",
        twilio_account_sid="account",
        twilio_auth_token="token",
        twilio_verify_service_sid="service",
    )

    assert settings.otp_provider is OtpProvider.FAKE


def test_fcm_mode_requires_project_and_service_account_credentials() -> None:
    with pytest.raises(ValidationError, match="FCM push requires"):
        Settings(push_provider="fcm", fcm_project_id="coffix-prod")


def test_production_rejects_invalid_jwt_signing_keys() -> None:
    with pytest.raises(ValidationError, match="JWT signing keys"):
        Settings(
            app_env="prod",
            otp_provider="twilio",
            otp_dev_code=None,
            twilio_account_sid="account",
            twilio_auth_token="token",
            twilio_verify_service_sid="service",
            jwt_private_key="not-a-private-key",
            jwt_public_key="not-a-public-key",
        )


def test_production_rejects_mismatched_jwt_signing_keys() -> None:
    first = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    second = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = first.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    public_pem = second.public_key().public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()

    with pytest.raises(ValidationError, match="matching JWT signing keys"):
        Settings(
            app_env="prod",
            otp_provider="twilio",
            otp_dev_code=None,
            twilio_account_sid="account",
            twilio_auth_token="token",
            twilio_verify_service_sid="service",
            jwt_private_key=private_pem,
            jwt_public_key=public_pem,
        )

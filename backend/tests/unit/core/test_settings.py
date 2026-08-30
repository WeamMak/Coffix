import pytest
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

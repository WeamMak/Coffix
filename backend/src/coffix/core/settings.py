from enum import StrEnum

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

LOCAL_DEVELOPMENT_PRIVATE_KEY = "local-development-private-key-change-me"
LOCAL_DEVELOPMENT_PUBLIC_KEY = "local-development-public-key-change-me"


class AppEnvironment(StrEnum):
    LOCAL = "local"
    TEST = "test"
    DEV = "dev"
    PROD = "prod"


class OtpProvider(StrEnum):
    FAKE = "fake"
    TWILIO = "twilio"


class PaymentProvider(StrEnum):
    FAKE = "fake"
    STRIPE = "stripe"


class MediaStorageBackend(StrEnum):
    LOCAL = "local"
    S3 = "s3"


class PushProvider(StrEnum):
    FAKE = "fake"
    FCM = "fcm"


class EmailProvider(StrEnum):
    DISABLED = "disabled"
    RESEND = "resend"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "backend/.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: AppEnvironment = AppEnvironment.LOCAL
    app_version: str = "dev"
    api_public_url: str = "http://localhost:8000"
    admin_public_url: str = "http://localhost:5173"
    database_url: str = "postgresql+asyncpg://coffix:coffix_local@localhost:5432/coffix"
    redis_url: str = "redis://localhost:6379/0"
    jwt_private_key: str = LOCAL_DEVELOPMENT_PRIVATE_KEY
    jwt_public_key: str = LOCAL_DEVELOPMENT_PUBLIC_KEY
    access_token_ttl_minutes: int = Field(default=15, gt=0)
    refresh_token_ttl_days: int = Field(default=30, gt=0)
    otp_resend_cooldown_seconds: int = Field(default=60, gt=0)
    otp_rate_limit_window_seconds: int = Field(default=900, gt=0)
    otp_request_phone_limit: int = Field(default=5, gt=0)
    otp_request_ip_limit: int = Field(default=20, gt=0)
    otp_verify_phone_limit: int = Field(default=10, gt=0)
    otp_verify_ip_limit: int = Field(default=50, gt=0)

    otp_provider: OtpProvider = OtpProvider.FAKE
    otp_dev_code: str | None = Field(default="123456", pattern=r"^\d{6}$")
    twilio_account_sid: str | None = None
    twilio_auth_token: str | None = None
    twilio_verify_service_sid: str | None = None

    payment_provider: PaymentProvider = PaymentProvider.FAKE
    stripe_secret_key: str | None = None
    stripe_webhook_secret: str | None = None

    media_storage_backend: MediaStorageBackend = MediaStorageBackend.LOCAL
    media_local_root: str = ".local/media"
    media_s3_bucket: str | None = None
    media_s3_prefix: str = "local/"
    media_presign_ttl_seconds: int = Field(default=900, gt=0)
    media_max_image_bytes: int = Field(default=10_485_760, gt=0)
    media_max_video_bytes: int = Field(default=104_857_600, gt=0)
    media_max_service_files: int = Field(default=5, gt=0)

    push_provider: PushProvider = PushProvider.FAKE
    fcm_project_id: str | None = None
    google_application_credentials: str | None = None
    email_provider: EmailProvider = EmailProvider.DISABLED
    resend_api_key: str | None = None

    cart_ttl_seconds: int = Field(default=3600, gt=0)
    order_payment_ttl_seconds: int = Field(default=1800, gt=0)
    shipping_fee_agorot: int = Field(default=3000, ge=0)
    shop_address_json: str = '{"city":"Tel Aviv","country":"IL"}'
    otel_exporter_otlp_endpoint: str | None = None
    log_level: str = "INFO"

    @model_validator(mode="after")
    def validate_provider_configuration(self) -> "Settings":
        if self.app_env is AppEnvironment.PROD:
            if self.otp_provider is OtpProvider.FAKE:
                raise ValueError("Production cannot use the fake OTP provider")
            if self.otp_dev_code is not None:
                raise ValueError("OTP_DEV_CODE is forbidden in production")
            uses_development_keys = self.jwt_private_key.startswith(
                "local-development-"
            ) or self.jwt_public_key.startswith("local-development-")
            if uses_development_keys:
                raise ValueError("Production requires non-development JWT signing keys")
            self._validate_production_jwt_keys()

        if self.otp_provider is OtpProvider.FAKE and self.otp_dev_code is None:
            raise ValueError("Fake OTP requires OTP_DEV_CODE")

        if self.otp_provider is OtpProvider.TWILIO and not all(
            (
                self.twilio_account_sid,
                self.twilio_auth_token,
                self.twilio_verify_service_sid,
            )
        ):
            raise ValueError("Twilio OTP requires all Twilio credentials")

        if self.payment_provider is PaymentProvider.STRIPE and not all(
            (self.stripe_secret_key, self.stripe_webhook_secret)
        ):
            raise ValueError("Stripe payments require Stripe credentials")

        if self.media_storage_backend is MediaStorageBackend.S3 and not self.media_s3_bucket:
            raise ValueError("S3 media storage requires MEDIA_S3_BUCKET")

        if self.push_provider is PushProvider.FCM and not self.fcm_project_id:
            raise ValueError("FCM push requires FCM_PROJECT_ID")

        if self.email_provider is EmailProvider.RESEND and not self.resend_api_key:
            raise ValueError("Resend email requires RESEND_API_KEY")

        return self

    def _validate_production_jwt_keys(self) -> None:
        try:
            private_key = serialization.load_pem_private_key(
                self.jwt_private_key.encode(),
                password=None,
            )
            public_key = serialization.load_pem_public_key(self.jwt_public_key.encode())
        except (TypeError, ValueError) as exc:
            raise ValueError("Production requires valid PEM JWT signing keys") from exc

        if not isinstance(private_key, rsa.RSAPrivateKey) or not isinstance(
            public_key, rsa.RSAPublicKey
        ):
            raise ValueError("Production requires RSA JWT signing keys")
        expected_public = private_key.public_key().public_numbers()
        if expected_public != public_key.public_numbers():
            raise ValueError("Production requires matching JWT signing keys")

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException

from coffix.admin.router import router as admin_router
from coffix.api.errors import (
    ApiError,
    api_error_handler,
    http_error_handler,
    unexpected_error_handler,
    validation_error_handler,
)
from coffix.api.middleware import CorrelationIdMiddleware
from coffix.auth.adapters.fake import FakeOtpProvider
from coffix.auth.adapters.twilio import TwilioOtpProvider
from coffix.auth.router import router as auth_router
from coffix.carts.router import router as carts_router
from coffix.catalog.router import router as catalog_router
from coffix.core.clock import SystemClock
from coffix.core.database import create_database_engine, create_session_factory
from coffix.core.ids import UuidGenerator
from coffix.core.logging import configure_logging
from coffix.core.metrics import MetricsMiddleware, MetricsRegistry
from coffix.core.rate_limit import RedisRateLimiter
from coffix.core.redis import create_redis_client
from coffix.core.settings import OtpProvider, Settings
from coffix.core.settings import PaymentProvider as PaymentProviderMode
from coffix.health.router import router as health_router
from coffix.machines.router import router as machines_router
from coffix.media.router import router as media_router
from coffix.media.store import create_media_store
from coffix.notifications.router import router as notifications_router
from coffix.orders.router import router as orders_router
from coffix.payments.adapters.fake import FakePaymentProvider
from coffix.payments.adapters.stripe import StripePaymentProvider
from coffix.payments.router import router as payments_router
from coffix.service.router import router as service_router
from coffix.users.router import router as users_router


def create_app(settings: Settings) -> FastAPI:
    configure_logging(settings.log_level)
    metrics = MetricsRegistry()

    @asynccontextmanager
    async def lifespan(application: FastAPI) -> AsyncIterator[None]:
        engine = create_database_engine(settings)
        redis_client = create_redis_client(settings)
        twilio_client: httpx.AsyncClient | None = None
        payment_client: httpx.AsyncClient | None = None
        clock = SystemClock()
        if settings.otp_provider is OtpProvider.FAKE:
            if settings.otp_dev_code is None:
                raise RuntimeError("Fake OTP provider requires OTP_DEV_CODE")
            otp_provider = FakeOtpProvider(settings.otp_dev_code)
        else:
            account_sid = settings.twilio_account_sid
            auth_token = settings.twilio_auth_token
            service_sid = settings.twilio_verify_service_sid
            if account_sid is None or auth_token is None or service_sid is None:
                raise RuntimeError("Twilio OTP provider is not configured")
            twilio_client = httpx.AsyncClient(timeout=10.0)
            otp_provider = TwilioOtpProvider(
                account_sid=account_sid,
                auth_token=auth_token,
                verify_service_sid=service_sid,
                client=twilio_client,
            )
        if settings.payment_provider is PaymentProviderMode.FAKE:
            payment_provider = FakePaymentProvider(signing_secret="local-fake-payment-secret")
        else:
            secret_key = settings.stripe_secret_key
            webhook_secret = settings.stripe_webhook_secret
            if secret_key is None or webhook_secret is None:
                raise RuntimeError("Stripe payment provider is not configured")
            payment_client = httpx.AsyncClient(timeout=10.0)
            payment_provider = StripePaymentProvider(
                secret_key=secret_key,
                webhook_secret=webhook_secret,
                client=payment_client,
            )
        media_store = await create_media_store(settings, clock)
        application.state.settings = settings
        application.state.database_engine = engine
        application.state.session_factory = create_session_factory(engine)
        application.state.redis = redis_client
        application.state.otp_provider = otp_provider
        application.state.payment_provider = payment_provider
        application.state.media_store = media_store
        application.state.rate_limiter = RedisRateLimiter(redis_client)
        application.state.clock = clock
        application.state.id_generator = UuidGenerator()
        application.state.metrics = metrics
        try:
            yield
        finally:
            if twilio_client is not None:
                await twilio_client.aclose()
            if payment_client is not None:
                await payment_client.aclose()
            await redis_client.aclose()
            await engine.dispose()

    application = FastAPI(
        title="Coffix API",
        version=settings.app_version,
        lifespan=lifespan,
    )
    application.state.settings = settings
    application.state.metrics = metrics
    application.add_middleware(CorrelationIdMiddleware)
    application.add_middleware(MetricsMiddleware, registry=metrics)
    application.add_exception_handler(ApiError, api_error_handler)
    application.add_exception_handler(HTTPException, http_error_handler)
    application.add_exception_handler(RequestValidationError, validation_error_handler)
    application.add_exception_handler(Exception, unexpected_error_handler)
    application.include_router(auth_router)
    application.include_router(users_router)
    application.include_router(catalog_router)
    application.include_router(carts_router)
    application.include_router(payments_router)
    application.include_router(orders_router)
    application.include_router(media_router)
    application.include_router(machines_router)
    application.include_router(service_router)
    application.include_router(notifications_router)
    application.include_router(admin_router)
    application.include_router(health_router)
    return application


app = create_app(Settings())

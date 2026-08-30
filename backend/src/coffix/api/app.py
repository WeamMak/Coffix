from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException

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
from coffix.core.rate_limit import RedisRateLimiter
from coffix.core.redis import create_redis_client
from coffix.core.settings import OtpProvider, Settings
from coffix.users.router import router as users_router


def create_app(settings: Settings) -> FastAPI:
    configure_logging(settings.log_level)

    @asynccontextmanager
    async def lifespan(application: FastAPI) -> AsyncIterator[None]:
        engine = create_database_engine(settings)
        redis_client = create_redis_client(settings)
        twilio_client: httpx.AsyncClient | None = None
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
        application.state.settings = settings
        application.state.database_engine = engine
        application.state.session_factory = create_session_factory(engine)
        application.state.redis = redis_client
        application.state.otp_provider = otp_provider
        application.state.rate_limiter = RedisRateLimiter(redis_client)
        application.state.clock = SystemClock()
        application.state.id_generator = UuidGenerator()
        try:
            yield
        finally:
            if twilio_client is not None:
                await twilio_client.aclose()
            await redis_client.aclose()
            await engine.dispose()

    application = FastAPI(
        title="Coffix API",
        version=settings.app_version,
        lifespan=lifespan,
    )
    application.add_middleware(CorrelationIdMiddleware)
    application.add_exception_handler(ApiError, api_error_handler)
    application.add_exception_handler(HTTPException, http_error_handler)
    application.add_exception_handler(RequestValidationError, validation_error_handler)
    application.add_exception_handler(Exception, unexpected_error_handler)
    application.include_router(auth_router)
    application.include_router(users_router)
    application.include_router(catalog_router)
    application.include_router(carts_router)
    return application


app = create_app(Settings())

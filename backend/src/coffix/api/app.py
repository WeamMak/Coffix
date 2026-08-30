from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

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
from coffix.core.database import create_database_engine, create_session_factory
from coffix.core.logging import configure_logging
from coffix.core.redis import create_redis_client
from coffix.core.settings import Settings


def create_app(settings: Settings) -> FastAPI:
    configure_logging(settings.log_level)

    @asynccontextmanager
    async def lifespan(application: FastAPI) -> AsyncIterator[None]:
        engine = create_database_engine(settings)
        redis_client = create_redis_client(settings)
        application.state.settings = settings
        application.state.database_engine = engine
        application.state.session_factory = create_session_factory(engine)
        application.state.redis = redis_client
        try:
            yield
        finally:
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
    return application


app = create_app(Settings())

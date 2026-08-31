from datetime import UTC, datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from coffix.api.app import create_app
from coffix.core.clock import FakeClock
from coffix.core.settings import Settings
from coffix.health.checks import (
    WORKER_HEARTBEAT_KEY,
    WORKER_LAST_EXPIRATION_KEY,
)

NOW = datetime(2026, 8, 31, 21, 0, tzinfo=UTC)


@pytest.mark.asyncio
async def test_liveness_responds_without_starting_dependencies() -> None:
    app = create_app(
        Settings(
            app_env="test",
            database_url="postgresql+asyncpg://invalid:invalid@127.0.0.1:1/invalid",
            redis_url="redis://127.0.0.1:1/0",
        )
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health/live")

    assert response.status_code == 200
    assert response.json() == {"status": "live", "version": "dev"}
    labels = (("method", "GET"), ("route", "/health/live"), ("status", "200"))
    assert app.state.metrics.counters[("api_requests_total", labels)] == 1


@pytest.mark.asyncio
async def test_readiness_reports_database_connection_failure() -> None:
    app = create_app(
        Settings(
            app_env="test",
            database_url="postgresql+asyncpg://invalid:invalid@127.0.0.1:1/invalid",
        )
    )

    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/health/ready")

    assert response.status_code == 503
    assert response.json()["status"] == "not_ready"
    assert response.json()["checks"]["database"]["status"] == "failed"
    assert "invalid" not in response.text


@pytest.mark.asyncio
async def test_readiness_rejects_migration_version_mismatch(
    migrated_database_url: str,
) -> None:
    engine = create_async_engine(migrated_database_url)
    try:
        async with engine.begin() as connection:
            await connection.execute(
                text("UPDATE alembic_version SET version_num = '0010_service_requests'")
            )
    finally:
        await engine.dispose()

    app = create_app(Settings(app_env="test", database_url=migrated_database_url))
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/health/ready")

    assert response.status_code == 503
    assert response.json()["checks"]["database"]["status"] == "ok"
    assert response.json()["checks"]["migration"]["status"] == "failed"
    assert response.json()["checks"]["migration"]["detail"] == "migration version mismatch"


@pytest.mark.asyncio
async def test_worker_health_reports_stale_and_current_heartbeat(
    migrated_database_url: str,
) -> None:
    app = create_app(Settings(app_env="test", database_url=migrated_database_url))
    async with app.router.lifespan_context(app):
        app.state.clock = FakeClock(NOW)
        await app.state.redis.set(
            WORKER_HEARTBEAT_KEY,
            (NOW - timedelta(minutes=5)).isoformat(),
        )
        await app.state.redis.set(
            WORKER_LAST_EXPIRATION_KEY,
            (NOW - timedelta(minutes=5)).isoformat(),
        )
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            stale = await client.get("/health/worker")
            await app.state.redis.set(WORKER_HEARTBEAT_KEY, NOW.isoformat())
            await app.state.redis.set(WORKER_LAST_EXPIRATION_KEY, NOW.isoformat())
            healthy = await client.get("/health/worker")
        await app.state.redis.delete(WORKER_HEARTBEAT_KEY, WORKER_LAST_EXPIRATION_KEY)

    assert stale.status_code == 503
    assert stale.json()["checks"]["heartbeat"]["status"] == "failed"
    assert healthy.status_code == 200
    assert healthy.json()["status"] == "ready"
    assert healthy.json()["checks"]["heartbeat"]["status"] == "ok"
    assert healthy.json()["checks"]["outbox"]["status"] == "ok"

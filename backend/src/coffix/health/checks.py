import asyncio
import os
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from time import monotonic
from typing import Awaitable, cast

from redis.asyncio import Redis
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncEngine

from coffix.core.clock import Clock
from coffix.core.settings import MediaStorageBackend, Settings
from coffix.health.schemas import HealthCheckRead, ReadinessRead
from coffix.notifications.models import OutboxEvent

EXPECTED_MIGRATION_REVISION = "0011_notifications_outbox_audit"
WORKER_HEARTBEAT_KEY = "coffix:worker:heartbeat"
WORKER_LAST_EXPIRATION_KEY = "coffix:worker:last_expiration_success"
DEPENDENCY_TIMEOUT_SECONDS = 2.0
WORKER_HEARTBEAT_MAX_AGE = timedelta(seconds=30)
WORKER_EXPIRATION_MAX_AGE = timedelta(minutes=2)
OUTBOX_MAX_AGE = timedelta(minutes=2)


@dataclass(slots=True)
class ReadinessChecks:
    engine: AsyncEngine
    redis: Redis
    settings: Settings
    clock: Clock

    async def check(self) -> ReadinessRead:
        database, migration = await self._database_and_migration()
        redis = await self._redis()
        storage = self._storage()
        checks = {
            "database": database,
            "migration": migration,
            "redis": redis,
            "storage": storage,
        }
        return ReadinessRead(
            status=(
                "ready"
                if all(component.status == "ok" for component in checks.values())
                else "not_ready"
            ),
            version=self.settings.app_version,
            checks=checks,
        )

    async def worker(self) -> ReadinessRead:
        heartbeat, expiration = await self._worker_timestamps()
        outbox = await self._outbox()
        checks = {
            "heartbeat": heartbeat,
            "expiration": expiration,
            "outbox": outbox,
        }
        return ReadinessRead(
            status=(
                "ready"
                if all(component.status == "ok" for component in checks.values())
                else "not_ready"
            ),
            version=self.settings.app_version,
            checks=checks,
        )

    async def _database_and_migration(self) -> tuple[HealthCheckRead, HealthCheckRead]:
        started = monotonic()
        try:
            async with asyncio.timeout(DEPENDENCY_TIMEOUT_SECONDS):
                async with self.engine.connect() as connection:
                    await connection.execute(text("SELECT 1"))
                    revision = await connection.scalar(
                        text("SELECT version_num FROM alembic_version")
                    )
        except Exception:
            return (
                HealthCheckRead(
                    status="failed",
                    detail="database connection failed",
                    latency_ms=_latency_ms(started),
                ),
                HealthCheckRead(status="failed", detail="migration version unavailable"),
            )
        return (
            HealthCheckRead(status="ok", latency_ms=_latency_ms(started)),
            HealthCheckRead(
                status="ok" if revision == EXPECTED_MIGRATION_REVISION else "failed",
                detail=(
                    None
                    if revision == EXPECTED_MIGRATION_REVISION
                    else "migration version mismatch"
                ),
            ),
        )

    async def _redis(self) -> HealthCheckRead:
        started = monotonic()
        try:
            async with asyncio.timeout(DEPENDENCY_TIMEOUT_SECONDS):
                if not await cast(Awaitable[bool], self.redis.ping()):
                    raise RuntimeError("Redis ping failed")
        except Exception:
            return HealthCheckRead(
                status="failed",
                detail="redis connection failed",
                latency_ms=_latency_ms(started),
            )
        return HealthCheckRead(status="ok", latency_ms=_latency_ms(started))

    def _storage(self) -> HealthCheckRead:
        if self.settings.media_storage_backend is MediaStorageBackend.S3:
            return HealthCheckRead(
                status="ok" if self.settings.media_s3_bucket else "failed",
                detail=None if self.settings.media_s3_bucket else "storage is not configured",
            )
        candidate = Path(self.settings.media_local_root).resolve()
        while not candidate.exists() and candidate != candidate.parent:
            candidate = candidate.parent
        ready = candidate.is_dir() and os.access(candidate, os.W_OK)
        return HealthCheckRead(
            status="ok" if ready else "failed",
            detail=None if ready else "local storage is not writable",
        )

    async def _worker_timestamps(self) -> tuple[HealthCheckRead, HealthCheckRead]:
        try:
            async with asyncio.timeout(DEPENDENCY_TIMEOUT_SECONDS):
                heartbeat_raw, expiration_raw = await self.redis.mget(
                    WORKER_HEARTBEAT_KEY,
                    WORKER_LAST_EXPIRATION_KEY,
                )
        except Exception:
            failed = HealthCheckRead(status="failed", detail="worker heartbeat unavailable")
            return failed, failed
        return (
            self._timestamp_check(
                heartbeat_raw,
                max_age=WORKER_HEARTBEAT_MAX_AGE,
                missing_detail="worker heartbeat missing",
                stale_detail="worker heartbeat stale",
            ),
            self._timestamp_check(
                expiration_raw,
                max_age=WORKER_EXPIRATION_MAX_AGE,
                missing_detail="expiration heartbeat missing",
                stale_detail="expiration heartbeat stale",
            ),
        )

    async def _outbox(self) -> HealthCheckRead:
        started = monotonic()
        try:
            async with asyncio.timeout(DEPENDENCY_TIMEOUT_SECONDS):
                async with self.engine.connect() as connection:
                    oldest = await connection.scalar(
                        select(func.min(OutboxEvent.available_at)).where(
                            OutboxEvent.processed_at.is_(None),
                            OutboxEvent.dead_lettered_at.is_(None),
                            OutboxEvent.available_at <= self.clock.now(),
                        )
                    )
        except Exception:
            return HealthCheckRead(
                status="failed",
                detail="outbox status unavailable",
                latency_ms=_latency_ms(started),
            )
        stale = oldest is not None and self.clock.now() - oldest > OUTBOX_MAX_AGE
        return HealthCheckRead(
            status="failed" if stale else "ok",
            detail="outbox lag exceeded" if stale else None,
            latency_ms=_latency_ms(started),
        )

    def _timestamp_check(
        self,
        raw: str | None,
        *,
        max_age: timedelta,
        missing_detail: str,
        stale_detail: str,
    ) -> HealthCheckRead:
        if raw is None:
            return HealthCheckRead(status="failed", detail=missing_detail)
        try:
            value = datetime.fromisoformat(raw)
            if value.tzinfo is None:
                raise ValueError("timestamp must have timezone")
        except ValueError:
            return HealthCheckRead(status="failed", detail="worker timestamp invalid")
        if self.clock.now() - value > max_age:
            return HealthCheckRead(status="failed", detail=stale_detail)
        return HealthCheckRead(status="ok")


@dataclass(slots=True)
class WorkerHealthReporter:
    redis: Redis
    clock: Clock
    last_expiration_at: datetime | None = None

    def record_expiration(self) -> None:
        self.last_expiration_at = self.clock.now()

    async def run(
        self,
        stop_event: asyncio.Event,
        *,
        interval_seconds: float = 5,
    ) -> None:
        while not stop_event.is_set():
            values = {WORKER_HEARTBEAT_KEY: self.clock.now().isoformat()}
            if self.last_expiration_at is not None:
                values[WORKER_LAST_EXPIRATION_KEY] = self.last_expiration_at.isoformat()
            await self.redis.mset(values)
            try:
                await asyncio.wait_for(stop_event.wait(), timeout=interval_seconds)
            except TimeoutError:
                pass


def _latency_ms(started: float) -> float:
    return round((monotonic() - started) * 1000, 3)

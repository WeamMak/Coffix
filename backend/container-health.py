"""Container liveness; set COFFIX_PROCESS=worker with the worker command."""

import asyncio
import os
import urllib.request
from datetime import UTC, datetime, timedelta


async def worker_live() -> None:
    from redis.asyncio import Redis

    from coffix.core.settings import Settings
    from coffix.health.checks import WORKER_HEARTBEAT_KEY

    client = Redis.from_url(Settings().redis_url, decode_responses=True)
    try:
        async with asyncio.timeout(3):
            value = await client.get(WORKER_HEARTBEAT_KEY)
        assert value is not None, "worker heartbeat missing"
        age = datetime.now(UTC) - datetime.fromisoformat(value)
        assert timedelta(0) <= age < timedelta(seconds=30), "worker heartbeat stale"
    finally:
        await client.aclose()


if os.environ.get("COFFIX_PROCESS") == "worker":
    asyncio.run(worker_live())
else:
    with urllib.request.urlopen("http://127.0.0.1:8000/health/live", timeout=3) as response:
        assert response.status == 200

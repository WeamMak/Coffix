from collections.abc import Awaitable
from typing import Protocol, cast

from redis.asyncio import Redis

INCREMENT_SCRIPT = """
local count = redis.call('INCR', KEYS[1])
if count == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
"""


class RateLimiter(Protocol):
    async def allow(self, key: str, *, limit: int, window_seconds: int) -> bool: ...

    async def acquire(self, key: str, *, ttl_seconds: int) -> bool: ...


class RedisRateLimiter:
    def __init__(self, redis: Redis) -> None:
        self.redis = redis

    async def allow(self, key: str, *, limit: int, window_seconds: int) -> bool:
        pending = cast(
            Awaitable[int],
            self.redis.eval(INCREMENT_SCRIPT, 1, key, window_seconds),
        )
        count = await pending
        return int(count) <= limit

    async def acquire(self, key: str, *, ttl_seconds: int) -> bool:
        acquired = await self.redis.set(key, "1", ex=ttl_seconds, nx=True)
        return bool(acquired)

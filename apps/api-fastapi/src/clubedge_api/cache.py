"""Rate limits and a cache that every instance of the API shares: in Redis when REDIS_URL is set,
otherwise in process memory. Each chooses its backend on first use, once server.py has read the
environment (.env.local included), so importing this module reads nothing.

Keys have the same prefixes as in the TypeScript apps (packages/cache-redis), so both can share a
Redis database.
"""

import functools
import json
import os
import time
from collections.abc import Callable
from typing import Final
from urllib.parse import urlsplit

from redis.asyncio import Redis
from redis.asyncio.retry import Retry
from redis.backoff import NoBackoff

from clubedge_api.memory_cache import Cache, MemoryCache
from clubedge_api.rate_limit import MemoryRateLimiter, RateLimiter, RateLimitResult

RATE_LIMIT_PREFIX: Final = "clubedge:rate-limit:"
CACHE_PREFIX: Final = "clubedge:cache:"

# Counts a request in its fixed window, which the window's first request starts, and returns the
# count and the milliseconds left in the window.
_FIXED_WINDOW: Final = """
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return { count, redis.call('PTTL', KEYS[1]) }
"""

# One client per URL for the life of the process. It connects on first use, and again after
# Redis restarts.
_clients: dict[str, Redis] = {}


def redis_client(url: str) -> Redis:
    """The process's client for the Redis at `url`. While Redis is down, a command fails within
    seconds, so a rate limit lets the request through rather than hold it."""
    client = _clients.get(url)
    if client is None:
        client = Redis.from_url(
            url,
            decode_responses=True,
            socket_connect_timeout=5,
            socket_timeout=5,
            # One retry, for a pooled connection that Redis closed in the meantime.
            retry=Retry(NoBackoff(), 1),
        )
        _clients[url] = client
    return client


class RedisRateLimiter:
    """Fixed-window limits shared by every instance that uses the same Redis database."""

    def __init__(
        self,
        url: str,
        requests: int = 10,
        window_seconds: int = 60,
        *,
        prefix: str = RATE_LIMIT_PREFIX,
        now: Callable[[], float] = time.time,
    ) -> None:
        if requests < 1:
            raise ValueError("Rate limit must allow at least one request.")
        if window_seconds < 1:
            raise ValueError("Rate limit window must be a positive number of seconds.")
        self._url = url
        self._requests = requests
        self._window_seconds = window_seconds
        self._prefix = prefix
        self._now = now

    async def limit(self, identifier: str) -> RateLimitResult:
        if not 1 <= len(identifier) <= 256:
            raise ValueError("Rate limit identifier must contain between 1 and 256 characters.")
        key = f"{self._prefix}{identifier}"
        window = str(self._window_seconds * 1_000)
        result: object = await redis_client(self._url).eval(_FIXED_WINDOW, 1, key, window)
        if not isinstance(result, list) or len(result) != 2:
            raise ValueError("Redis returned an invalid rate limit response.")
        count, milliseconds_left = int(result[0]), int(result[1])
        return RateLimitResult(
            success=count <= self._requests,
            limit=self._requests,
            remaining=max(0, self._requests - count),
            reset_at=self._now() + max(0, milliseconds_left) / 1_000,
        )


class RedisCache:
    """Values shared by every instance that uses the same Redis database, stored as JSON."""

    def __init__(self, url: str, *, prefix: str = CACHE_PREFIX) -> None:
        self._url = url
        self._prefix = prefix

    async def get(self, key: str) -> object | None:
        value = await redis_client(self._url).get(f"{self._prefix}{key}")
        if value is None:
            return None
        try:
            parsed: object = json.loads(value)
        except ValueError:
            # Not JSON, so something else stored it: the text as it is.
            return value
        return parsed

    async def set(self, key: str, value: object, ttl_seconds: int) -> None:
        if ttl_seconds < 1:
            raise ValueError("Cache TTL must be a positive whole number of seconds.")
        try:
            serialized = json.dumps(value)
        except (TypeError, ValueError) as error:
            raise ValueError("Cache values must be JSON serializable.") from error
        await redis_client(self._url).set(f"{self._prefix}{key}", serialized, ex=ttl_seconds)


def _redis_url() -> str | None:
    """REDIS_URL, or None when it is empty."""
    url = os.environ.get("REDIS_URL", "").strip()
    if not url:
        return None
    parts = urlsplit(url)
    if parts.scheme not in ("redis", "rediss") or not parts.netloc:
        raise ValueError("REDIS_URL must be a redis:// or rediss:// URL.")
    return url


def _limiter_backend(requests: int, window_seconds: int) -> RateLimiter:
    url = _redis_url()
    if url:
        return RedisRateLimiter(url, requests, window_seconds)
    return MemoryRateLimiter(requests, window_seconds)


class _FirstUseLimiter:
    """Chooses Redis or memory when the first request comes, rather than when routes are made."""

    def __init__(self, requests: int, window_seconds: int) -> None:
        self._requests = requests
        self._window_seconds = window_seconds
        self._limiter: RateLimiter | None = None

    async def limit(self, identifier: str) -> RateLimitResult:
        if self._limiter is None:
            self._limiter = _limiter_backend(self._requests, self._window_seconds)
        return await self._limiter.limit(identifier)


def create_rate_limiter(requests: int = 10, window_seconds: int = 60) -> RateLimiter:
    """Allows `requests` per `window_seconds` for each identifier: counted in Redis when
    REDIS_URL is set, so every instance shares the count, otherwise in this process's memory."""
    return _FirstUseLimiter(requests, window_seconds)


@functools.cache
def _cache_backend() -> Cache:
    """Redis when REDIS_URL is set, otherwise process memory, chosen on first use."""
    url = _redis_url()
    if url:
        return RedisCache(url)
    return MemoryCache()


async def cache_get(key: str) -> object | None:
    """The value cached under `key`, or None when there is none or it has expired."""
    return await _cache_backend().get(key)


async def cache_set(key: str, value: object, ttl_seconds: int) -> None:
    """Caches `value`, which must be JSON serializable, under `key` for `ttl_seconds`."""
    await _cache_backend().set(key, value, ttl_seconds)

"""Rate limits and cached values in process memory, which suits a single server instance.
Projects that run several instances should use the Redis module instead."""

from clubedge_api.memory_cache import MemoryCache
from clubedge_api.rate_limit import MemoryRateLimiter, RateLimiter

_cache = MemoryCache()


def create_rate_limiter(requests: int = 10, window_seconds: int = 60) -> RateLimiter:
    """Allows `requests` per `window_seconds` for each identifier, counted in this process."""
    return MemoryRateLimiter(requests, window_seconds)


async def cache_get(key: str) -> object | None:
    """The value cached under `key`, or None when there is none or it has expired."""
    return await _cache.get(key)


async def cache_set(key: str, value: object, ttl_seconds: int) -> None:
    """Caches `value` under `key` for `ttl_seconds`."""
    await _cache.set(key, value, ttl_seconds)

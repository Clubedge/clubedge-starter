"""cache.py: rate limits and cached values in Redis once REDIS_URL is set, in memory until then,
and the Redis round trip of `pnpm check:services`. A fake stands in for Redis."""

import asyncio
from collections.abc import Iterator
from types import SimpleNamespace
from typing import Self

import pytest

from clubedge_api import cache
from clubedge_api.check_services import service_checks, with_retry

URL = "redis://localhost:6379"


class FakeRedis:
    """Stands in for redis.asyncio.Redis: keeps what the commands store, and counts requests the
    way the rate limit's script does."""

    def __init__(self) -> None:
        self.connected: list[str] = []
        self.values: dict[str, str] = {}
        self.counts: dict[str, int] = {}
        self.scripts: list[tuple[int, tuple[str, ...]]] = []
        # What eval answers instead of a count, to stand in for an unexpected reply.
        self.reply: object = None

    def from_url(self, url: str, **options: object) -> Self:
        self.connected.append(url)
        return self

    async def eval(self, script: str, numkeys: int, *keys_and_args: str) -> object:
        self.scripts.append((numkeys, keys_and_args))
        if self.reply is not None:
            return self.reply
        key, window_milliseconds = keys_and_args
        self.counts[key] = self.counts.get(key, 0) + 1
        return [self.counts[key], int(window_milliseconds)]

    async def get(self, name: str) -> str | None:
        return self.values.get(name)

    async def set(self, name: str, value: str, *, ex: int) -> bool:
        self.values[name] = value
        return True


@pytest.fixture
def redis(monkeypatch: pytest.MonkeyPatch) -> Iterator[FakeRedis]:
    """Every Redis client cache.py makes is this fake, and REDIS_URL starts unset."""
    fake = FakeRedis()
    monkeypatch.setattr(cache, "Redis", SimpleNamespace(from_url=fake.from_url))
    monkeypatch.setattr(cache, "_clients", {})
    monkeypatch.delenv("REDIS_URL", raising=False)
    cache._cache_backend.cache_clear()
    yield fake
    cache._cache_backend.cache_clear()


def test_counts_requests_in_redis_under_the_shared_key_prefix(redis: FakeRedis) -> None:
    limiter = cache.RedisRateLimiter(URL, 2, 60, now=lambda: 1_000.0)
    results = [asyncio.run(limiter.limit("client")) for _ in range(3)]
    assert [result.success for result in results] == [True, True, False]
    assert [result.remaining for result in results] == [1, 0, 0]
    assert results[0].reset_at == 1_060.0
    assert redis.scripts[0] == (1, ("clubedge:rate-limit:client", "60000"))


def test_reuses_one_connection_per_redis_url(redis: FakeRedis) -> None:
    asyncio.run(cache.RedisRateLimiter(URL).limit("a"))
    asyncio.run(cache.RedisRateLimiter(URL).limit("b"))
    assert redis.connected == [URL]


def test_rejects_an_unexpected_redis_reply(redis: FakeRedis) -> None:
    redis.reply = "nope"
    with pytest.raises(ValueError, match="invalid rate limit response"):
        asyncio.run(cache.RedisRateLimiter(URL).limit("client"))


def test_caches_json_values_in_redis(redis: FakeRedis) -> None:
    shared = cache.RedisCache(URL)
    asyncio.run(shared.set("plans", {"pro": 1}, 60))
    assert redis.values["clubedge:cache:plans"] == '{"pro": 1}'
    assert asyncio.run(shared.get("plans")) == {"pro": 1}
    assert asyncio.run(shared.get("missing")) is None
    redis.values["clubedge:cache:text"] = "not json"
    assert asyncio.run(shared.get("text")) == "not json"
    with pytest.raises(ValueError, match="TTL"):
        asyncio.run(shared.set("plans", 1, 0))
    with pytest.raises(ValueError, match="JSON"):
        asyncio.run(shared.set("plans", object(), 60))


def test_limits_and_caches_in_memory_while_redis_url_is_empty(
    redis: FakeRedis, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("REDIS_URL", " ")
    limiter = cache.create_rate_limiter(1, 60)
    assert asyncio.run(limiter.limit("client")).success
    assert not asyncio.run(limiter.limit("client")).success
    asyncio.run(cache.cache_set("key", {"value": 1}, 60))
    assert asyncio.run(cache.cache_get("key")) == {"value": 1}
    assert redis.connected == []


def test_uses_redis_once_redis_url_is_set_choosing_on_first_use(
    redis: FakeRedis, monkeypatch: pytest.MonkeyPatch
) -> None:
    limiter = cache.create_rate_limiter(2, 60)
    monkeypatch.setenv("REDIS_URL", URL)
    asyncio.run(limiter.limit("client"))
    assert redis.connected == [URL]
    asyncio.run(cache.cache_set("key", "cached", 60))
    assert redis.values["clubedge:cache:key"] == '"cached"'
    assert asyncio.run(cache.cache_get("key")) == "cached"


def test_rejects_a_redis_url_that_is_not_one(
    redis: FakeRedis, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("REDIS_URL", "https://example.com")
    with pytest.raises(ValueError, match="REDIS_URL"):
        asyncio.run(cache.create_rate_limiter().limit("client"))


def test_checks_redis_with_a_round_trip_when_redis_url_is_set(redis: FakeRedis) -> None:
    unset = {check.name: check for check in service_checks({})}
    assert unset["Redis"].skip == "REDIS_URL is not set; the API uses process memory"
    check = {check.name: check for check in service_checks({"REDIS_URL": URL})}["Redis"]
    assert check.skip is None
    assert asyncio.run(with_retry(check.run, attempts=1)) == "wrote and read a cached value"
    assert "clubedge:cache:check-services" in redis.values

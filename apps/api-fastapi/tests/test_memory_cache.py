"""The cache held in process memory, which cache.py uses without Redis."""

import asyncio

import pytest

from clubedge_api.memory_cache import MemoryCache


def test_keeps_a_copy_of_each_value_until_it_expires() -> None:
    clock = [1_000.0]
    cache = MemoryCache(now=lambda: clock[0])
    value = {"plan": "pro"}
    asyncio.run(cache.set("key", value, 60))
    value["plan"] = "free"
    assert asyncio.run(cache.get("key")) == {"plan": "pro"}
    clock[0] = 1_060.0
    assert asyncio.run(cache.get("key")) is None
    assert asyncio.run(cache.get("missing")) is None


def test_returns_a_copy_that_leaves_the_cache_unchanged() -> None:
    cache = MemoryCache()
    asyncio.run(cache.set("key", {"plan": "pro"}, 60))
    read = asyncio.run(cache.get("key"))
    assert isinstance(read, dict)
    read["plan"] = "free"
    assert asyncio.run(cache.get("key")) == {"plan": "pro"}


def test_holds_a_bounded_number_of_entries() -> None:
    cache = MemoryCache(max_keys=2, now=lambda: 0.0)
    for key in ["a", "b", "c"]:
        asyncio.run(cache.set(key, key.upper(), 60))
    # "a" was the oldest, so it went.
    assert asyncio.run(cache.get("a")) is None
    assert asyncio.run(cache.get("c")) == "C"


def test_refuses_a_ttl_that_is_not_positive() -> None:
    with pytest.raises(ValueError):
        asyncio.run(MemoryCache().set("key", 1, 0))

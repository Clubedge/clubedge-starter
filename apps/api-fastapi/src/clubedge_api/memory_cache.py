"""A key-value cache whose entries expire, and the one held in process memory, which cache.py
uses when the project has no Redis."""

import copy
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Protocol


class Cache(Protocol):
    """A key-value cache whose entries expire: in Redis or process memory (cache.py)."""

    async def get(self, key: str) -> object | None:
        """The value cached under `key`, or None when there is none or it has expired."""

    async def set(self, key: str, value: object, ttl_seconds: int) -> None:
        """Caches `value` under `key` for `ttl_seconds`."""


@dataclass
class _Entry:
    value: object
    # When the entry expires, in seconds since the epoch, as time.time() counts them.
    expires_at: float


class MemoryCache:
    """Values held in process memory. They are per process and vanish on restart, so use Redis
    when the API runs on several instances. Past `max_keys` entries, the oldest one goes."""

    def __init__(self, *, max_keys: int = 10_000, now: Callable[[], float] = time.time) -> None:
        self._max_keys = max_keys
        self._now = now
        self._entries: dict[str, _Entry] = {}

    async def get(self, key: str) -> object | None:
        entry = self._entries.get(key)
        if entry is None:
            return None
        if entry.expires_at <= self._now():
            del self._entries[key]
            return None
        # A copy, as Redis returns a new value each time: changing it leaves the cache as it was.
        return copy.deepcopy(entry.value)

    async def set(self, key: str, value: object, ttl_seconds: int) -> None:
        if ttl_seconds <= 0:
            raise ValueError("Cache TTL must be a positive number of seconds.")
        self._entries.pop(key, None)
        if self._entries and len(self._entries) >= self._max_keys:
            del self._entries[next(iter(self._entries))]
        # A copy, so changing `value` afterwards leaves the cached value as it was.
        self._entries[key] = _Entry(copy.deepcopy(value), self._now() + ttl_seconds)

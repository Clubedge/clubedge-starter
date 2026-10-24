"""Rate limits for routes anyone can call, per client address. The composition root (server.py)
makes the limiters, in Redis or process memory; tests and an API without a shared cache use
memory."""

import logging
import math
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Protocol

from fastapi import Request
from starlette.datastructures import Headers

from clubedge_api.http import ApiError, Guard
from clubedge_api.settings import ClientIpSettings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class RateLimitResult:
    success: bool
    limit: int
    remaining: int
    # When the window ends, in seconds since the epoch, as time.time() counts them.
    reset_at: float


class RateLimiter(Protocol):
    async def limit(self, identifier: str) -> RateLimitResult:
        """Counts a request from `identifier` and says whether it is within the limit."""


# Makes a limiter allowing `requests` per `window_seconds`, as server.py does.
CreateRateLimiter = Callable[[int, int], RateLimiter]


@dataclass
class _Window:
    count: int
    reset_at: float


class MemoryRateLimiter:
    """Fixed-window limits held in process memory. They apply per process, so use Redis when the
    API runs on several instances."""

    def __init__(
        self,
        requests: int = 10,
        window_seconds: int = 60,
        *,
        max_keys: int = 10_000,
        now: Callable[[], float] = time.time,
    ) -> None:
        if requests < 1:
            raise ValueError("Rate limit must allow at least one request.")
        if window_seconds < 1:
            raise ValueError("Rate limit window must be a positive number of seconds.")
        self._requests = requests
        self._window_seconds = window_seconds
        self._max_keys = max_keys
        self._now = now
        self._windows: dict[str, _Window] = {}

    async def limit(self, identifier: str) -> RateLimitResult:
        if not 1 <= len(identifier) <= 256:
            raise ValueError("Rate limit identifier must contain between 1 and 256 characters.")
        now = self._now()
        window = self._windows.get(identifier)
        if window is None or window.reset_at <= now:
            if len(self._windows) >= self._max_keys:
                self._evict_expired(now)
            # Still full: drop the oldest entry rather than grow without bound.
            if len(self._windows) >= self._max_keys:
                del self._windows[next(iter(self._windows))]
            window = _Window(count=0, reset_at=now + self._window_seconds)
            self._windows[identifier] = window
        window.count += 1
        return RateLimitResult(
            success=window.count <= self._requests,
            limit=self._requests,
            remaining=max(0, self._requests - window.count),
            reset_at=window.reset_at,
        )

    def _evict_expired(self, now: float) -> None:
        for key in [key for key, window in self._windows.items() if window.reset_at <= now]:
            del self._windows[key]


def create_memory_limiter(requests: int, window_seconds: int) -> RateLimiter:
    """Limits held in this process: for tests, and for an API without a shared cache."""
    return MemoryRateLimiter(requests, window_seconds)


# Neither CLIENT_IP_HEADER nor TRUSTED_PROXY_HOPS: clients connect to the API directly.
_DIRECT = ClientIpSettings()


def _entries(headers: Headers, name: str) -> list[str]:
    """A header's comma-separated entries, across repeated lines in order, as Node.js and fetch
    join them: some proxies add a line of their own instead of extending the client's."""
    return ",".join(headers.getlist(name)).split(",")


def client_ip(
    headers: Headers, settings: ClientIpSettings = _DIRECT, socket_address: str | None = None
) -> str:
    """The client's address, found as getClientIp in @clubedge/core finds it. With a header in
    `settings`, that header's value (its first entry, should it hold a list). With trusted hops,
    the X-Forwarded-For entry that many places from the end: the one the outermost of your
    proxies added; entries before it are whatever the client sent, so they never count. Without
    either, or when the request lacks what they name, the connection's own address, else
    "unknown". Without a connection address and either setting, it trusts the nearest proxy,
    whose entry is the last."""
    no_connection = not settings.header and socket_address is None
    hops = settings.trusted_hops or (1 if no_connection else 0)
    address = ""
    if settings.header:
        address = _entries(headers, settings.header)[0]
    elif hops > 0:
        entries = _entries(headers, "x-forwarded-for")
        if len(entries) >= hops:
            address = entries[-hops]
    return (address.strip() or socket_address or "unknown")[:64]


def rate_limit(
    limiter: RateLimiter,
    *,
    scope: str,
    fail_open: bool = True,
    client_ip_settings: ClientIpSettings = _DIRECT,
) -> Guard:
    """Answers 429 rate_limited, with Retry-After in seconds, once a client address has used up
    its requests for the window. `scope` names the limit, so routes sharing a limiter backend
    count separately. When the backend (Redis) fails, the request goes through (`fail_open`, the
    default), so an outage locks nobody out, or is refused with 503 unavailable.
    `client_ip_settings` says where the client's address comes from (settings.py reads it)."""

    async def guard(request: Request) -> None:
        socket_address = request.client.host if request.client else None
        address = client_ip(request.headers, client_ip_settings, socket_address)
        try:
            result = await limiter.limit(f"{scope}:{address}")
        except Exception:
            logger.exception("Rate limiter unavailable")
            if not fail_open:
                raise ApiError(503, "unavailable", "Try again in a moment.") from None
            return
        if not result.success:
            seconds = max(1, math.ceil(result.reset_at - time.time()))
            raise ApiError(
                429,
                "rate_limited",
                "Too many requests. Try again later.",
                headers={"Retry-After": str(seconds)},
            )

    return guard

"""Rate limits per client address, and what happens when the limiter's backend fails."""

import asyncio

import pytest
from fastapi import Depends
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

from clubedge_api.app import create_app
from clubedge_api.rate_limit import (
    MemoryRateLimiter,
    RateLimiter,
    client_ip,
    create_memory_limiter,
    rate_limit,
)
from tests.fakes import UnavailableLimiter, dependencies


def limited_client(limiter: RateLimiter, *, fail_open: bool = True) -> TestClient:
    app = create_app(dependencies())
    guard = rate_limit(limiter, scope="test", fail_open=fail_open)

    @app.post("/limited", dependencies=[Depends(guard)])
    async def limited() -> JSONResponse:
        return JSONResponse({"ok": True})

    return TestClient(app)


def test_counts_requests_in_a_fixed_window() -> None:
    clock = [1_000.0]
    limiter = MemoryRateLimiter(2, 60, now=lambda: clock[0])
    results = [asyncio.run(limiter.limit("a")) for _ in range(3)]
    assert [result.success for result in results] == [True, True, False]
    assert [result.remaining for result in results] == [1, 0, 0]
    assert {result.reset_at for result in results} == {1_060.0}
    clock[0] = 1_060.0
    assert asyncio.run(limiter.limit("a")).success
    assert asyncio.run(limiter.limit("b")).remaining == 1


def test_holds_a_bounded_number_of_windows() -> None:
    limiter = MemoryRateLimiter(1, 60, max_keys=2, now=lambda: 0.0)
    for identifier in ["a", "b", "c"]:
        asyncio.run(limiter.limit(identifier))
    # "a" was the oldest, so it was dropped and starts over.
    assert asyncio.run(limiter.limit("a")).success
    assert not asyncio.run(limiter.limit("c")).success


def test_refuses_unusable_limits() -> None:
    with pytest.raises(ValueError):
        MemoryRateLimiter(0, 60)
    with pytest.raises(ValueError):
        MemoryRateLimiter(1, 0)
    with pytest.raises(ValueError):
        asyncio.run(MemoryRateLimiter().limit(""))
    with pytest.raises(ValueError):
        asyncio.run(MemoryRateLimiter().limit("x" * 257))


def test_reads_the_client_address_from_the_proxy_headers() -> None:
    assert client_ip({"x-forwarded-for": " 203.0.113.7 , 10.0.0.1"}) == "203.0.113.7"
    assert client_ip({"x-real-ip": "198.51.100.2"}) == "198.51.100.2"
    assert client_ip({"x-forwarded-for": "", "x-real-ip": "198.51.100.2"}) == "198.51.100.2"
    assert client_ip({}) == "unknown"
    assert client_ip({"x-forwarded-for": "x" * 100}) == "x" * 64


def test_answers_429_with_retry_after_once_an_address_used_its_requests() -> None:
    client = limited_client(create_memory_limiter(2, 60))
    first = {"x-forwarded-for": "203.0.113.7"}
    assert [client.post("/limited", headers=first).status_code for _ in range(2)] == [200, 200]
    response = client.post("/limited", headers=first)
    assert response.status_code == 429
    assert response.json()["error"]["code"] == "rate_limited"
    assert 1 <= int(response.headers["retry-after"]) <= 60
    # Each address has its own count.
    assert client.post("/limited", headers={"x-forwarded-for": "203.0.113.8"}).status_code == 200


def test_names_each_limit_so_routes_count_separately() -> None:
    limiter = create_memory_limiter(1, 60)
    assert limited_client(limiter).post("/limited").status_code == 200
    other = create_app(dependencies())

    @other.post("/other", dependencies=[Depends(rate_limit(limiter, scope="other"))])
    async def other_route() -> JSONResponse:
        return JSONResponse({"ok": True})

    assert TestClient(other).post("/other").status_code == 200
    assert limited_client(limiter).post("/limited").status_code == 429


def test_lets_requests_through_when_the_backend_fails_unless_told_not_to() -> None:
    assert limited_client(UnavailableLimiter()).post("/limited").status_code == 200
    response = limited_client(UnavailableLimiter(), fail_open=False).post("/limited")
    assert response.status_code == 503
    assert response.json() == {
        "error": {"code": "unavailable", "message": "Try again in a moment."}
    }

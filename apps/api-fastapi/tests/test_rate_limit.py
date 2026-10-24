"""Rate limits per client address, and what happens when the limiter's backend fails."""

import asyncio

import pytest
from fastapi import Depends
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
from starlette.datastructures import Headers

from clubedge_api.app import create_app
from clubedge_api.rate_limit import (
    MemoryRateLimiter,
    RateLimiter,
    client_ip,
    create_memory_limiter,
    rate_limit,
)
from clubedge_api.settings import ClientIpSettings, parse_client_ip_settings
from tests.fakes import UnavailableLimiter, dependencies

SOCKET = "192.0.2.10"
# One proxy in front, which appends the address it saw to whatever the client sent.
ONE_PROXY = ClientIpSettings(trusted_hops=1)


def limited_client(
    limiter: RateLimiter,
    *,
    fail_open: bool = True,
    client_ip_settings: ClientIpSettings = ONE_PROXY,
) -> TestClient:
    app = create_app(dependencies())
    guard = rate_limit(
        limiter, scope="test", fail_open=fail_open, client_ip_settings=client_ip_settings
    )

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


def test_uses_the_connections_address_while_no_proxy_is_trusted() -> None:
    headers = Headers({"x-forwarded-for": "198.51.100.66", "x-real-ip": "198.51.100.67"})
    assert client_ip(headers, socket_address=SOCKET) == SOCKET


def test_counts_trusted_proxies_from_the_end_past_what_the_client_sent() -> None:
    # The client sent 198.51.100.66 itself; the proxy in front appended the address it saw.
    one_proxy = Headers({"x-forwarded-for": "198.51.100.66, 203.0.113.1"})
    assert client_ip(one_proxy, ONE_PROXY, SOCKET) == "203.0.113.1"
    # Two proxies: the outer one appended the client's address, the inner one the outer proxy's.
    two_proxies = Headers({"x-forwarded-for": "198.51.100.66, 203.0.113.1, 10.0.0.2"})
    assert client_ip(two_proxies, ClientIpSettings(trusted_hops=2), SOCKET) == "203.0.113.1"
    # A proxy that adds a line of its own instead of extending the client's.
    lines = Headers(
        raw=[(b"x-forwarded-for", b"198.51.100.66"), (b"x-forwarded-for", b"203.0.113.1")]
    )
    assert client_ip(lines, ONE_PROXY, SOCKET) == "203.0.113.1"


def test_falls_back_to_the_connections_address_when_fewer_proxies_added_an_entry() -> None:
    single = Headers({"x-forwarded-for": "203.0.113.1"})
    assert client_ip(single, ClientIpSettings(trusted_hops=2), SOCKET) == SOCKET
    assert client_ip(Headers(), ONE_PROXY, SOCKET) == SOCKET
    assert client_ip(single, ClientIpSettings(trusted_hops=2)) == "unknown"
    assert client_ip(Headers()) == "unknown"


def test_trusts_the_nearest_proxy_without_a_connection_address() -> None:
    forwarded = Headers({"x-forwarded-for": "198.51.100.66, 203.0.113.1"})
    assert client_ip(forwarded) == "203.0.113.1"


def test_reads_the_hosts_own_header_first_and_the_connections_address_without_it() -> None:
    settings = ClientIpSettings(header="fly-client-ip", trusted_hops=1)
    forwarded = {"x-forwarded-for": "198.51.100.66, 10.0.0.2"}
    headers = Headers({"fly-client-ip": " 203.0.113.7 ", **forwarded})
    assert client_ip(headers, settings, SOCKET) == "203.0.113.7"
    assert client_ip(Headers(forwarded), settings, SOCKET) == SOCKET


def test_bounds_the_identifier_length() -> None:
    assert client_ip(Headers({"x-forwarded-for": "x" * 100}), ONE_PROXY) == "x" * 64


def test_reads_the_client_address_settings_unset_or_empty_meaning_neither() -> None:
    assert parse_client_ip_settings({}) == ClientIpSettings()
    empty = {"CLIENT_IP_HEADER": "", "TRUSTED_PROXY_HOPS": ""}
    assert parse_client_ip_settings(empty) == ClientIpSettings()
    both = {"CLIENT_IP_HEADER": " Fly-Client-IP ", "TRUSTED_PROXY_HOPS": "2"}
    assert parse_client_ip_settings(both) == ClientIpSettings("fly-client-ip", 2)


def test_refuses_client_address_settings_that_cannot_be_right() -> None:
    with pytest.raises(ValueError, match='header name, such as x-real-ip, not "x real ip"'):
        parse_client_ip_settings({"CLIENT_IP_HEADER": "x real ip"})
    for hops in ["-1", "1.5", "one", "11"]:
        with pytest.raises(ValueError, match="TRUSTED_PROXY_HOPS must be a whole number from 0"):
            parse_client_ip_settings({"TRUSTED_PROXY_HOPS": hops})


def test_ignores_x_forwarded_for_while_no_proxy_is_trusted() -> None:
    client = limited_client(create_memory_limiter(1, 60), client_ip_settings=ClientIpSettings())
    assert client.post("/limited", headers={"x-forwarded-for": "203.0.113.7"}).status_code == 200
    # A new first entry makes no new client: both come from the test client's connection.
    assert client.post("/limited", headers={"x-forwarded-for": "203.0.113.8"}).status_code == 429


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

"""Browsers ask the API before a page on another origin may call it: the website's address, and
the others it is served at (the one it had before a new domain), may; no other may."""

import httpx
import pytest

from clubedge_api.settings import parse_frontend_aliases
from tests.fakes import client

ORIGIN = "https://app.example.com"
ALIAS = "https://app.example.workers.dev"


def preflight(origin: str, method: str = "GET") -> httpx.Response:
    headers = {
        "origin": origin,
        "access-control-request-method": method,
        "access-control-request-headers": "authorization",
    }
    response: httpx.Response = client(frontend_origin=ORIGIN, frontend_aliases=(ALIAS,)).options(
        "/api/health", headers=headers
    )
    return response


def test_lets_in_the_websites_address_and_the_others_it_is_served_at() -> None:
    for origin in [ORIGIN, ALIAS]:
        assert preflight(origin).headers.get("access-control-allow-origin") == origin


def test_keeps_out_any_other_site() -> None:
    assert "access-control-allow-origin" not in preflight("https://elsewhere.example").headers


def test_allows_every_method_a_route_can_have() -> None:
    allowed = preflight(ORIGIN, "DELETE").headers["access-control-allow-methods"]
    methods = {method.strip() for method in allowed.split(",")}
    assert {"GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"} <= methods


def test_reads_the_other_addresses_as_origins() -> None:
    assert parse_frontend_aliases("") == ()
    assert parse_frontend_aliases(" https://old.example.com/path , http://localhost:3000 ") == (
        "https://old.example.com",
        "http://localhost:3000",
    )
    with pytest.raises(ValueError, match="not an absolute URL"):
        parse_frontend_aliases("app.example.com")

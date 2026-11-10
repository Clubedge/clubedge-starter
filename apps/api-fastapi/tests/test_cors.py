"""Browsers ask the API before a page on another origin may call it: the website's address, and
the others it is served at (the one it had before a new domain), may; no other may."""

import re

import httpx
import pytest

from clubedge_api.settings import parse_frontend_aliases
from tests.fakes import client

ORIGIN = "https://app.example.com"
ALIAS = "https://app.example.workers.dev"


def preflight(
    origin: str, method: str = "GET", aliases: tuple[str, ...] = (ALIAS,)
) -> httpx.Response:
    headers = {
        "origin": origin,
        "access-control-request-method": method,
        "access-control-request-headers": "authorization",
    }
    response: httpx.Response = client(frontend_origin=ORIGIN, frontend_aliases=aliases).options(
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


def test_reads_each_address_as_browsers_send_it() -> None:
    # The host in lower case, and no port that is the scheme's own.
    assert parse_frontend_aliases("https://OLD.Example.com:443/path,http://old.example.com:80") == (
        "https://old.example.com",
        "http://old.example.com",
    )
    assert parse_frontend_aliases("https://old.example.com:8443,http://[::1]:3000") == (
        "https://old.example.com:8443",
        "http://[::1]:3000",
    )
    aliases = parse_frontend_aliases("https://APP.Example.workers.dev:443/")
    assert preflight(ALIAS, aliases=aliases).headers.get("access-control-allow-origin") == ALIAS


@pytest.mark.parametrize(
    "alias", ["old.example.com:8443", "http://:3000", "http://example.com:abc"]
)
def test_refuses_by_name_an_address_without_a_scheme_a_host_or_a_usable_port(alias: str) -> None:
    message = f'FRONTEND_ALIASES has "{alias}", not an absolute URL'
    with pytest.raises(ValueError, match=re.escape(message)):
        parse_frontend_aliases(f"https://old.example.com,{alias}")

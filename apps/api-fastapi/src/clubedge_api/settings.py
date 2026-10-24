"""The API's environment, read once. Locally, .env.local fills in what the shell doesn't set."""

import os
import re
from collections.abc import Mapping
from dataclasses import dataclass
from functools import cache
from pathlib import Path


def load_env_file(path: Path) -> None:
    """Sets KEY=value lines from `path` that the environment doesn't already have."""
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        key, sep, value = line.strip().partition("=")
        if not sep or key.startswith("#"):
            continue
        os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


@dataclass(frozen=True)
class ClientIpSettings:
    """Where rate limits find the client's address: CLIENT_IP_HEADER and TRUSTED_PROXY_HOPS
    (SETUP.md, "Client addresses"). With neither, it is the connection's own address."""

    # A header the host sets to the client's address, replacing any copy the client sent.
    header: str | None = None
    # How many reverse proxies you run in front of the API that append to X-Forwarded-For.
    trusted_hops: int = 0


# The characters of an HTTP token (RFC 9110), which header names are made of.
_HEADER_NAME = re.compile(r"[!#$%&'*+.^_`|~0-9a-z-]+")
_MAX_TRUSTED_HOPS = 10


def parse_client_ip_settings(env: Mapping[str, str]) -> ClientIpSettings:
    """Reads CLIENT_IP_HEADER and TRUSTED_PROXY_HOPS as @clubedge/core reads them, where unset or
    empty means neither. Raises ValueError for a value that cannot be right, so the API stops at
    startup instead of limiting requests by the wrong address."""
    header = env.get("CLIENT_IP_HEADER", "").strip()
    hops = env.get("TRUSTED_PROXY_HOPS", "").strip()
    if header and not _HEADER_NAME.fullmatch(header.lower()):
        raise ValueError(
            f'CLIENT_IP_HEADER must be a header name, such as x-real-ip, not "{header}"'
        )
    if hops and not (re.fullmatch(r"[0-9]+", hops) and int(hops) <= _MAX_TRUSTED_HOPS):
        raise ValueError(
            f'TRUSTED_PROXY_HOPS must be a whole number from 0 to {_MAX_TRUSTED_HOPS}, not "{hops}"'
        )
    return ClientIpSettings(header=header.lower() or None, trusted_hops=int(hops or "0"))


@dataclass(frozen=True)
class Settings:
    # The frontend proxies /api here in development; containers listen on every interface.
    host: str
    port: int
    database_url: str | None
    frontend_origin: str
    supabase_url: str | None
    supabase_publishable_key: str | None
    client_ip_settings: ClientIpSettings


@cache
def get_settings() -> Settings:
    load_env_file(Path(".env.local"))
    return Settings(
        host=os.environ.get("HOST") or "127.0.0.1",
        port=int(os.environ.get("PORT") or "3001"),
        database_url=os.environ.get("DATABASE_URL") or None,
        frontend_origin=os.environ.get("FRONTEND_URL") or "http://localhost:3000",
        supabase_url=os.environ.get("SUPABASE_URL") or None,
        supabase_publishable_key=os.environ.get("SUPABASE_PUBLISHABLE_KEY") or None,
        client_ip_settings=parse_client_ip_settings(os.environ),
    )


def is_production() -> bool:
    """Whether this is a production deploy: NODE_ENV=production, which the API's image sets, as
    the Hono API's does."""
    return os.environ.get("NODE_ENV") == "production"

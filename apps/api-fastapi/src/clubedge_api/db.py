"""PostgreSQL readiness. The schema and its migrations live in packages/db (pnpm db:migrate)."""

import asyncio
import re
from urllib.parse import urlsplit

import psycopg


async def is_database_ready(url: str | None, timeout: float = 2.0) -> bool:
    """Whether the database answers `select 1` in time; no URL is not ready either."""
    if not url:
        return False
    try:
        async with asyncio.timeout(timeout):
            connection = await psycopg.AsyncConnection.connect(url, connect_timeout=2)
            async with connection:
                await connection.execute("select 1")
        return True
    except (OSError, TimeoutError, psycopg.Error):
        return False


def is_neon_pooled_url(url: str) -> bool:
    """Whether a URL points at Neon's connection pooler: its compute's host with -pooler added.
    Migrations need the direct host, as poolers in transaction mode break their sessions."""
    try:
        host = urlsplit(url.strip()).hostname or ""
    except ValueError:
        return False
    return host.endswith(".neon.tech") and re.match(r"[^.]+-pooler\.", host) is not None

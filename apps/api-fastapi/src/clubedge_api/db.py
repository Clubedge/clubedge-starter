"""PostgreSQL readiness. The schema and its migrations live in packages/db (pnpm db:migrate)."""

import asyncio
import re
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from urllib.parse import urlsplit

import psycopg
from psycopg.rows import TupleRow

from clubedge_api.settings import get_settings


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


@asynccontextmanager
async def connect() -> AsyncIterator[psycopg.AsyncConnection[TupleRow]]:
    """A connection to DATABASE_URL for one unit of work, committed when the block ends and
    rolled back when it raises. It never prepares statements, which a pooler in transaction mode
    (such as Supabase's) can't keep."""
    url = get_settings().database_url
    if not url:
        raise RuntimeError("DATABASE_URL is not set.")
    connection = await psycopg.AsyncConnection.connect(
        url, connect_timeout=5, prepare_threshold=None
    )
    async with connection:
        yield connection

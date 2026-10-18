"""PostgreSQL readiness. The schema and its migrations live in packages/db (pnpm db:migrate)."""

import asyncio

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

"""Checks every service the API uses with a real round trip: `pnpm check:services`.

It reads the API's .env.local like the API does, so it confirms the API's own settings.
"""

import asyncio
import os
import sys
from collections.abc import Awaitable, Callable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path

import psycopg

from clubedge_api.db import is_neon_pooled_url
from clubedge_api.settings import load_env_file


@dataclass(frozen=True)
class Check:
    """A service round trip: `run` says what it did, or raises why it failed."""

    name: str
    run: Callable[[], Awaitable[str]]
    # Why it doesn't run, such as a variable that isn't set.
    skip: str | None = None


class CheckError(Exception):
    """A failure that waiting won't fix, such as a wrong URL: reported without retrying."""


def skip_unless(value: str, reason: str) -> str | None:
    """Skips a check, saying `reason`, when `value` (the variable it needs) is empty."""
    return None if value else reason


def service_checks(env: Mapping[str, str]) -> list[Check]:
    """Every service this API uses, for the modules this project has."""
    database_url = env.get("DATABASE_URL", "").strip()
    direct_url = env.get("DATABASE_URL_DIRECT", "").strip()

    async def postgres() -> str:
        async with await psycopg.AsyncConnection.connect(database_url, connect_timeout=5) as db:
            row = await (await db.execute("select current_database()")).fetchone()
            # clubedge:if auth=better-auth
            # Better Auth's tables exist once `pnpm db:migrate` has run.
            await db.execute("select 1 from auth_user limit 1")
            # clubedge:end
        return f'connected to database "{row[0] if row else ""}"'

    async def postgres_direct() -> str:
        if is_neon_pooled_url(direct_url):
            raise CheckError("it points at Neon's pooler: use the host without -pooler")
        async with await psycopg.AsyncConnection.connect(direct_url, connect_timeout=5) as db:
            row = await (await db.execute("select current_database()")).fetchone()
        return f'connected to database "{row[0] if row else ""}" through DATABASE_URL_DIRECT'

    return [
        Check("PostgreSQL", postgres, skip_unless(database_url, "DATABASE_URL is not set")),
        Check(
            "PostgreSQL, direct",
            postgres_direct,
            skip_unless(direct_url, "DATABASE_URL_DIRECT is not set; migrations use DATABASE_URL"),
        ),
    ]


async def with_retry(
    run: Callable[[], Awaitable[str]], attempts: int = 15, delay: float = 2.0
) -> str:
    """Services can take a few seconds to accept connections after `pnpm infra:up`."""
    attempt = 1
    while True:
        try:
            return await run()
        except CheckError:
            raise
        except Exception:
            if attempt >= attempts:
                raise
            attempt += 1
            await asyncio.sleep(delay)


async def run_checks(checks: Sequence[Check], attempts: int = 15, delay: float = 2.0) -> bool:
    """Runs each check in turn and prints how it went: whether every check that ran passed."""
    passed = True
    for check in checks:
        if check.skip:
            print(f"-  {check.name}: skipped ({check.skip})")
            continue
        try:
            print(f"ok {check.name}: {await with_retry(check.run, attempts, delay)}")
        except Exception as error:
            passed = False
            print(f"x  {check.name}: {str(error) or type(error).__name__}")
    return passed


def main() -> int:
    load_env_file(Path(".env.local"))
    # psycopg's async connections need a selector event loop, which Windows doesn't default to.
    loop_factory = asyncio.SelectorEventLoop if sys.platform == "win32" else None
    if not asyncio.run(run_checks(service_checks(os.environ)), loop_factory=loop_factory):
        print(
            "Check the variables in apps/api/.env.local, then start the services.",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

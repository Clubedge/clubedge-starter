"""Checks every service the API uses with a real round trip: `pnpm check:services`.

It reads the API's .env.local like the API does, so it confirms the API's own settings.
"""

import asyncio
import os
import sys
import time  # clubedge:only cache=redis
from collections.abc import Callable, Coroutine, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import psycopg

from clubedge_api.cache import RedisCache  # clubedge:only cache=redis
from clubedge_api.db import is_neon_pooled_url
from clubedge_api.payments_stripe import StripePayments  # clubedge:only payments=stripe
from clubedge_api.settings import load_env_file


@dataclass(frozen=True)
class Check:
    """A service round trip: `run` says what it did, or raises why it failed."""

    name: str
    run: Callable[[], Coroutine[Any, Any, str]]
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
    redis_url = env.get("REDIS_URL", "").strip()  # clubedge:only cache=redis

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

    # clubedge:if cache=redis
    async def redis() -> str:
        cache = RedisCache(redis_url)
        value = {"checkedAt": time.time_ns()}
        await cache.set("check-services", value, 30)
        if await cache.get("check-services") != value:
            raise RuntimeError("read back a different value")
        return "wrote and read a cached value"

    # clubedge:end
    # clubedge:if storage=s3 && infra=local
    storage_directory = env.get("STORAGE_DIRECTORY", "").strip()

    async def local_folder_storage() -> str:
        from clubedge_api.storage_local import FileSystemStorage

        storage = FileSystemStorage(storage_directory)
        key = f"check-services/{os.urandom(8).hex()}.txt"
        await storage.upload(key, b"ok", "text/plain")
        text = (await storage.download(key)).decode()
        await storage.delete(key)
        if text != "ok":
            raise CheckError(f'read back "{text}"')
        return f"wrote, read back, and deleted a file in {storage_directory}"

    # clubedge:end
    # clubedge:if storage=s3
    storage_bucket = env.get("STORAGE_BUCKET", "").strip()

    async def file_storage() -> str:
        from clubedge_api.storage_s3 import S3Storage

        storage = S3Storage(
            bucket=storage_bucket,
            region=env.get("STORAGE_REGION", "").strip() or "auto",
            endpoint=env.get("STORAGE_ENDPOINT", "").strip() or None,
            access_key_id=env.get("STORAGE_ACCESS_KEY_ID", "").strip() or None,
            secret_access_key=env.get("STORAGE_SECRET_ACCESS_KEY", "").strip() or None,
        )
        key = f"check-services/{os.urandom(8).hex()}.txt"
        await storage.upload(key, b"ok", "text/plain")
        text = (await storage.download(key)).decode()
        await storage.delete(key)
        if text != "ok":
            raise CheckError(f'read back "{text}"')
        return f'uploaded, read back, and deleted an object in "{storage_bucket}"'

    # clubedge:end
    # clubedge:if email=smtp
    smtp_url = env.get("SMTP_URL", "").strip()

    async def smtp_email() -> str:
        from clubedge_api.email_smtp import SmtpEmail

        try:
            email = SmtpEmail(smtp_url, env.get("EMAIL_FROM", "").strip() or "no-reply@example.com")
        except ValueError as error:
            raise CheckError(str(error)) from error
        # Connects and authenticates without sending anything.
        await email.verify()
        return f"connected to {email.server.host}:{email.server.port}"

    # clubedge:end
    # clubedge:if email=resend
    resend_api_key = env.get("RESEND_API_KEY", "").strip()

    async def resend_email() -> str:
        from clubedge_api.email_resend import ResendEmail

        try:
            email = ResendEmail(
                resend_api_key, env.get("EMAIL_FROM", "").strip() or "no-reply@example.com"
            )
        except ValueError as error:
            raise CheckError(str(error)) from error
        # Checks the API key without sending anything.
        await email.verify()
        return "API key accepted"

    # clubedge:end
    # clubedge:if payments=stripe
    stripe_secret_key = env.get("STRIPE_SECRET_KEY", "").strip()

    async def stripe_api() -> str:
        # A read-only request that checks the key; nothing is charged or created.
        payments = StripePayments(
            secret_key=stripe_secret_key,
            webhook_secret=env.get("STRIPE_WEBHOOK_SECRET", "").strip() or "unused",
            prices={},
            api_base=env.get("STRIPE_API_BASE", "").strip() or None,
        )
        await payments.verify()
        return "secret key accepted"

    # clubedge:end
    return [
        Check("PostgreSQL", postgres, skip_unless(database_url, "DATABASE_URL is not set")),
        Check(
            "PostgreSQL, direct",
            postgres_direct,
            skip_unless(direct_url, "DATABASE_URL_DIRECT is not set; migrations use DATABASE_URL"),
        ),
        # clubedge:if cache=redis
        Check(
            "Redis",
            redis,
            skip_unless(redis_url, "REDIS_URL is not set; the API uses process memory"),
        ),
        # clubedge:end
        # clubedge:if storage=s3 && infra=local
        Check(
            "Local folder storage",
            local_folder_storage,
            skip_unless(storage_directory, "STORAGE_DIRECTORY is not set"),
        ),
        # clubedge:end
        # clubedge:if storage=s3
        Check(
            "File storage", file_storage, skip_unless(storage_bucket, "STORAGE_BUCKET is not set")
        ),
        # clubedge:end
        # clubedge:if email=smtp
        Check(
            "Email (SMTP)",
            smtp_email,
            skip_unless(smtp_url, "SMTP_URL is not set; development prints emails to the log"),
        ),
        # clubedge:end
        # clubedge:if email=resend
        Check(
            "Email (Resend)",
            resend_email,
            skip_unless(
                resend_api_key, "RESEND_API_KEY is not set; development prints emails to the log"
            ),
        ),
        # clubedge:end
        # clubedge:if payments=stripe
        Check(
            "Payments (Stripe)",
            stripe_api,
            skip_unless(stripe_secret_key, "STRIPE_SECRET_KEY is not set"),
        ),
        # clubedge:end
    ]


async def with_retry(
    run: Callable[[], Coroutine[Any, Any, str]], attempts: int = 15, delay: float = 2.0
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

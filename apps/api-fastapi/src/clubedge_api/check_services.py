"""Checks that the services the API needs answer: `pnpm check:services`."""

import asyncio
import sys

from clubedge_api.db import is_database_ready
from clubedge_api.settings import get_settings

if __name__ == "__main__":
    if asyncio.run(is_database_ready(get_settings().database_url)):
        print("Database: reachable.")
        sys.exit(0)
    print(
        "Database: not reachable. Check DATABASE_URL in apps/api/.env.local, "
        "then start it (pnpm infra:up).",
        file=sys.stderr,
    )
    sys.exit(1)

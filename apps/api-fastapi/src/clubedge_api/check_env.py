"""Validates the API's production environment before a deploy: `pnpm check:env`."""

import sys

from clubedge_api.settings import get_settings

if __name__ == "__main__":
    settings = get_settings()
    if not settings.database_url:
        print("DATABASE_URL is required.", file=sys.stderr)
        sys.exit(1)
    print("API environment is valid.")

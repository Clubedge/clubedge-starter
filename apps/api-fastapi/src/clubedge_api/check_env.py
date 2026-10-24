"""Checks the API's production variables before a deploy: `pnpm check:env`.

It reads the environment it runs in, not .env.local, so run it where the deploy's variables are
set; SKIP_ENV_CHECK=1 skips it.
"""

import os
import sys

from clubedge_api.production_env import check_production_env


def main() -> int:
    if os.environ.get("SKIP_ENV_CHECK") == "1":
        print(
            "check:env skipped (SKIP_ENV_CHECK=1): missing variables fail at runtime instead.",
            file=sys.stderr,
        )
        return 0
    if os.environ.get("HOST") == "127.0.0.1":
        print(
            "HOST is 127.0.0.1, so only this machine reaches the API. Containers set HOST=0.0.0.0.",
            file=sys.stderr,
        )
    result = check_production_env(os.environ)
    if result.ok:
        print("check:env: every production variable this API needs is set.")
        return 0
    lines = [
        "check:env: the production environment is incomplete.",
        *(f"  - {r.key} is not set ({r.use})" for r in result.missing),
        *(
            f"  - {key} points at localhost, which the deployed API can't reach"
            for key in result.local
        ),
        *(f"  - {problem}" for problem in result.invalid),
        "Fix them in the host's environment variables for the API service, then deploy again.",
    ]
    print("\n".join(lines), file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())

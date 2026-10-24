"""Proves the running API against the shared contract: `pnpm test` runs it after pytest.

clubedge-contract-check (packages/contract) starts the API, waits for it, and runs the
conformance suite over HTTP, for the project's modules and the optional parts of the contract
this API implements.
"""

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

# The optional parts of the contract this API implements: capabilityOperations in
# packages/contract/src/conformance.ts. The suite expects each one's operations to work when the
# project has the capability's module, and to answer 404 otherwise.
CAPABILITIES: list[str] = ["account"]

# This stack's descriptor, which only the Starter repository has.
STACK_DESCRIPTOR = Path(__file__).resolve().parents[2] / "clubedge.stack.json"


def starter_modules() -> dict[str, str] | None:
    """In the Starter repository, every module this stack implements: no option was chosen, so
    its API serves the routes of them all. A generated project records its modules in its
    package.json instead, which the suite reads itself."""
    if not STACK_DESCRIPTOR.is_file():
        return None
    descriptor = json.loads(STACK_DESCRIPTOR.read_text(encoding="utf-8"))
    options: dict[str, dict[str, object]] = descriptor.get("modules", {})
    return {
        module: "starter"
        for module, entries in options.items()
        if any(option != "none" for key in entries for option in key.split("|"))
    }


def main() -> int:
    check = shutil.which("clubedge-contract-check")
    if check is None:
        print(
            "clubedge-contract-check is missing: run `pnpm test`, which puts it on the PATH.",
            file=sys.stderr,
        )
        return 1
    env = {**os.environ, "API_CAPABILITIES": ",".join(CAPABILITIES)}
    modules = starter_modules()
    if modules is not None:
        env.setdefault("API_MODULES", json.dumps(modules))
    # `uv run` put this environment's python first on the PATH.
    command = [check, "--", "python", "-m", "clubedge_api"]
    return subprocess.run(command, env=env, check=False).returncode


if __name__ == "__main__":
    sys.exit(main())

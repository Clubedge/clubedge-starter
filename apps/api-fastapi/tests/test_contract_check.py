"""`pnpm test`'s contract check: what it tells the shared suite about this API."""

import json
import shutil
import subprocess
from typing import Any

import pytest

from clubedge_api import contract_check


def test_passes_the_capabilities_and_starts_the_api(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("API_MODULES", raising=False)
    calls: list[tuple[list[str], dict[str, str]]] = []

    def run(command: list[str], **options: Any) -> subprocess.CompletedProcess[bytes]:
        calls.append((command, options["env"]))
        return subprocess.CompletedProcess(command, 0)

    monkeypatch.setattr(shutil, "which", lambda name: f"/bin/{name}")
    monkeypatch.setattr(subprocess, "run", run)
    assert contract_check.main() == 0
    [(command, env)] = calls
    assert command == ["/bin/clubedge-contract-check", "--", "python", "-m", "clubedge_api"]
    assert env["API_CAPABILITIES"] == ",".join(contract_check.CAPABILITIES)
    modules = contract_check.starter_modules()
    if modules is None:
        # A generated project: the suite reads the modules from its package.json.
        assert "API_MODULES" not in env
    else:
        assert json.loads(env["API_MODULES"]) == modules
        assert modules["auth"] == "starter"


def test_says_how_to_run_it_without_the_contract_package(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(shutil, "which", lambda name: None)
    assert contract_check.main() == 1
    assert "pnpm test" in capsys.readouterr().err

"""`pnpm check:services`: which checks run, how they retry, and what they print."""

import asyncio

import pytest

from clubedge_api.check_services import Check, CheckError, run_checks, service_checks, with_retry


def checks_by_name(env: dict[str, str]) -> dict[str, Check]:
    return {check.name: check for check in service_checks(env)}


def test_skips_the_services_whose_variables_are_unset() -> None:
    checks = checks_by_name({})
    assert checks["PostgreSQL"].skip == "DATABASE_URL is not set"
    assert checks["PostgreSQL, direct"].skip
    configured = checks_by_name(
        {"DATABASE_URL": "postgresql://db.example.com/app", "DATABASE_URL_DIRECT": " "}
    )
    assert configured["PostgreSQL"].skip is None
    assert configured["PostgreSQL, direct"].skip


def test_refuses_neons_pooler_as_the_direct_url_without_connecting() -> None:
    url = "postgresql://u:p@ep-x-1-pooler.eu-central-1.aws.neon.tech/neondb"
    check = checks_by_name({"DATABASE_URL_DIRECT": url})["PostgreSQL, direct"]
    with pytest.raises(CheckError, match="pooler"):
        asyncio.run(check.run())


def test_retries_until_the_service_answers() -> None:
    attempts: list[int] = []

    async def flaky() -> str:
        attempts.append(1)
        if len(attempts) < 3:
            raise ConnectionError("not yet")
        return "answered"

    assert asyncio.run(with_retry(flaky, attempts=5, delay=0)) == "answered"
    assert len(attempts) == 3


def test_gives_up_after_the_last_attempt_and_on_failures_waiting_cannot_fix() -> None:
    calls: list[str] = []

    async def down() -> str:
        calls.append("down")
        raise ConnectionError("refused")

    async def misconfigured() -> str:
        calls.append("misconfigured")
        raise CheckError("wrong URL")

    with pytest.raises(ConnectionError):
        asyncio.run(with_retry(down, attempts=2, delay=0))
    with pytest.raises(CheckError):
        asyncio.run(with_retry(misconfigured, attempts=2, delay=0))
    assert calls == ["down", "down", "misconfigured"]


def test_prints_each_check_and_fails_when_one_does(capsys: pytest.CaptureFixture[str]) -> None:
    async def ok() -> str:
        return "connected"

    async def broken() -> str:
        raise TimeoutError

    checks = [
        Check("Skipped", ok, skip="NOT_SET is not set"),
        Check("Working", ok),
        Check("Broken", broken),
    ]
    assert asyncio.run(run_checks(checks[:2], attempts=1, delay=0))
    assert not asyncio.run(run_checks(checks, attempts=1, delay=0))
    lines = capsys.readouterr().out.splitlines()
    assert lines[-3:] == [
        "-  Skipped: skipped (NOT_SET is not set)",
        "ok Working: connected",
        "x  Broken: TimeoutError",
    ]

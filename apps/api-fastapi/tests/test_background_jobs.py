"""The API starts the worker as it starts serving. A configuration mistake must be reported, not
stop the API, so endpoints that need no queue keep working."""

import logging
from collections.abc import Iterator

import pytest

from clubedge_api import background_jobs
from clubedge_api.settings import get_settings


@pytest.fixture(autouse=True)
def no_jobs_settings(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """No jobs variables, whatever .env.local sets, and no queue from an earlier test."""
    get_settings()
    for name in ("REDIS_URL", "JOBS_WORKER", "CRON_SECRET", "NODE_ENV"):
        monkeypatch.delenv(name, raising=False)
    yield
    background_jobs._state.queue = None


def test_reports_a_missing_redis_url_instead_of_failing_to_start(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setenv("JOBS_WORKER", "on")
    with caplog.at_level(logging.ERROR, logger=background_jobs.__name__):
        background_jobs.start_jobs_worker()
    assert "Background jobs: the worker did not start." in caplog.text
    assert background_jobs._state.queue is None
    with pytest.raises(ValueError, match="REDIS_URL"):
        background_jobs.get_jobs()


def test_starts_no_worker_with_jobs_worker_off(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setenv("JOBS_WORKER", "off")
    with caplog.at_level(logging.ERROR, logger=background_jobs.__name__):
        background_jobs.start_jobs_worker()
    assert caplog.text == ""
    assert background_jobs.background_jobs.runner() == "scheduler"


def test_runs_a_worker_unless_jobs_worker_is_off(monkeypatch: pytest.MonkeyPatch) -> None:
    assert background_jobs.background_jobs.runner() == "worker"
    monkeypatch.setenv("JOBS_WORKER", "sometimes")
    with pytest.raises(ValueError, match="JOBS_WORKER"):
        background_jobs.is_worker_enabled()


def test_reads_the_cron_secret_only_when_it_is_long_enough(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    assert background_jobs.background_jobs.cron_secret() is None
    monkeypatch.setenv("CRON_SECRET", "too-short")
    with pytest.raises(ValueError, match="16 or more"):
        background_jobs.cron_secret()
    monkeypatch.setenv("CRON_SECRET", "a-cron-secret-of-16-or-more")
    assert background_jobs.cron_secret() == "a-cron-secret-of-16-or-more"


def test_creates_one_queue_per_process(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("REDIS_URL", "redis://127.0.0.1:6379")
    queue = background_jobs.get_jobs()
    assert queue.id == "bullmq"
    assert background_jobs.get_jobs() is queue

"""GET /api/jobs/run, which a scheduler calls where no worker runs."""

import asyncio

from fastapi.testclient import TestClient

from clubedge_api.job_queue import MemoryJobs
from clubedge_api.jobs import sample_job
from clubedge_api.routes.jobs import BackgroundJobs
from tests.fakes import client

SECRET = "a-cron-secret-of-16-or-more"


def make_api(secret: str | None) -> tuple[TestClient, MemoryJobs]:
    queue = MemoryJobs([sample_job])
    jobs = BackgroundJobs(
        runner=lambda: "scheduler", queue=lambda: queue, cron_secret=lambda: secret
    )
    return client(jobs=jobs), queue


def test_does_not_exist_without_a_cron_secret() -> None:
    api, _ = make_api(None)
    response = api.get("/api/jobs/run", headers={"authorization": f"Bearer {SECRET}"})
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_refuses_a_caller_without_the_secret() -> None:
    api, _ = make_api(SECRET)
    assert api.get("/api/jobs/run").status_code == 401
    wrong = api.get("/api/jobs/run", headers={"authorization": "Bearer the-wrong-secret-entirely"})
    assert wrong.status_code == 401
    assert wrong.json()["error"]["code"] == "unauthorized"


def test_runs_the_jobs_that_are_due_for_the_scheduler() -> None:
    api, queue = make_api(SECRET)
    asyncio.run(queue.enqueue(sample_job, {"requestedBy": "anonymous"}))
    response = api.get("/api/jobs/run", headers={"authorization": f"Bearer {SECRET}"})
    assert response.status_code == 200
    assert "no-store" in response.headers["cache-control"]
    assert response.json() == {"completed": 1, "failed": 0}

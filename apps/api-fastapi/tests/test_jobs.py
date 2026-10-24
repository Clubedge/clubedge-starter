"""The jobs routes in process, with a memory queue."""

import asyncio
from unittest.mock import ANY

from clubedge_api.job_queue import JobQueue, MemoryJobs
from clubedge_api.jobs import sample_job
from clubedge_api.routes.jobs import BackgroundJobs
from tests.fakes import USER, client, signed_in


def memory_jobs(queue: MemoryJobs) -> BackgroundJobs:
    return BackgroundJobs(runner=lambda: "worker", queue=lambda: queue)


def test_queues_the_sample_job_for_the_signed_in_user_and_lists_it() -> None:
    queue = MemoryJobs([sample_job])
    api = client(get_current_user=signed_in(USER), jobs=memory_jobs(queue))

    response = api.post("/api/jobs/sample", json={})
    assert response.status_code == 202
    job_id = response.json()["id"]
    assert isinstance(job_id, str)
    assert queue.jobs[0].data == {"requestedBy": USER["email"]}

    status = api.get("/api/jobs")
    assert "no-store" in status.headers["cache-control"]
    assert status.json() == {
        "runner": "worker",
        "jobs": [
            {
                "id": job_id,
                "name": "sample",
                "state": "queued",
                "createdAt": ANY,
                "completedAt": None,
            }
        ],
    }

    asyncio.run(queue.run_due())
    [job] = api.get("/api/jobs").json()["jobs"]
    assert job["state"] == "completed"
    assert job["completedAt"].endswith("Z")


def test_ignores_a_repeat_within_seconds() -> None:
    api = client(jobs=memory_jobs(MemoryJobs([sample_job])))
    assert api.post("/api/jobs/sample", json={}).status_code == 202
    repeat = api.post("/api/jobs/sample", json={})
    assert repeat.status_code == 202
    assert repeat.json() == {"id": None}


def test_lists_only_the_current_users_jobs() -> None:
    queue = MemoryJobs([sample_job])
    signed_in_api = client(get_current_user=signed_in(USER), jobs=memory_jobs(queue))
    assert signed_in_api.post("/api/jobs/sample", json={}).status_code == 202
    signed_out = client(jobs=memory_jobs(queue))
    assert signed_out.get("/api/jobs").json() == {"runner": "worker", "jobs": []}


def test_reports_jobs_as_null_when_the_queue_cannot_be_read() -> None:
    def unreachable() -> JobQueue:
        raise ConnectionError("Redis is unreachable.")

    api = client(jobs=BackgroundJobs(runner=lambda: "scheduler", queue=unreachable))
    status = api.get("/api/jobs")
    assert status.status_code == 200
    assert status.json() == {"runner": "scheduler", "jobs": None}

    queued = api.post("/api/jobs/sample", json={})
    assert queued.status_code == 503
    assert queued.json()["error"]["code"] == "unavailable"


def test_queues_the_sample_job_only_from_json() -> None:
    queue = MemoryJobs([sample_job])
    api = client(jobs=memory_jobs(queue))
    response = api.post("/api/jobs/sample", content=b"{}", headers={"content-type": "text/plain"})
    assert response.status_code == 415
    assert queue.jobs == []


def test_has_no_jobs_routes_without_background_jobs() -> None:
    api = client()
    for method, path in [
        ("GET", "/api/jobs"),
        ("POST", "/api/jobs/sample"),
        ("GET", "/api/jobs/run"),
        ("GET", "/api/inngest"),
    ]:
        response = api.request(method, path, json={} if method == "POST" else None)
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "not_found"

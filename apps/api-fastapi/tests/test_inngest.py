"""/api/inngest, which hands Inngest's requests to the provider's handler."""

from fastapi import Request, Response
from fastapi.responses import JSONResponse

from clubedge_api.job_queue import MemoryJobs
from clubedge_api.jobs import sample_job
from clubedge_api.routes.jobs import BackgroundJobs
from tests.fakes import client


def test_hands_inngests_requests_to_its_handler_as_they_came() -> None:
    seen: list[str] = []

    async def handler(request: Request) -> Response:
        body = (await request.body()).decode()
        seen.append(f"{request.method} {request.url.query} {body}")
        return JSONResponse({"ok": True})

    queue = MemoryJobs([sample_job])
    queue.handler = handler
    api = client(jobs=BackgroundJobs(runner=lambda: "service", queue=lambda: queue))
    # Signed by Inngest, so neither JSON-only nor read before the handler checks the signature.
    response = api.post(
        "/api/inngest?fnId=sample&stepId=step",
        content=b"raw body",
        headers={"content-type": "text/plain", "x-inngest-signature": "t=1&s=abc"},
    )
    assert response.status_code == 200
    assert api.put("/api/inngest").status_code == 200
    assert seen == ["POST fnId=sample&stepId=step raw body", "PUT  "]


def test_does_not_exist_for_a_queue_that_runs_jobs_itself() -> None:
    queue = MemoryJobs([sample_job])
    api = client(jobs=BackgroundJobs(runner=lambda: "worker", queue=lambda: queue))
    response = api.get("/api/inngest")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"

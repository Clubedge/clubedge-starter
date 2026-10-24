"""Background jobs for the dashboard: how they run and the current user's recent sample jobs, and a
button's worth of work to queue the sample job."""

import logging
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal, TypedDict

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from clubedge_api.contract import GetCurrentUser
from clubedge_api.http import NO_STORE, ApiError, json_only
from clubedge_api.job_queue import JobQueue, JobRecord, JobState
from clubedge_api.jobs import sample_job

logger = logging.getLogger(__name__)

# Where jobs run: this API's worker, a scheduler calling /api/jobs/run, or a jobs service
# (Inngest) calling /api/inngest.
Runner = Literal["worker", "scheduler", "service"]


def _no_cron_secret() -> str | None:
    return None


@dataclass(frozen=True)
class BackgroundJobs:
    """What the jobs routes need from background_jobs.py, so tests can pass a memory queue."""

    runner: Callable[[], Runner]
    # The queue, created on first use.
    queue: Callable[[], JobQueue]
    # Authorizes GET /api/jobs/run; None turns it off.
    cron_secret: Callable[[], str | None] = _no_cron_secret


class JobRun(TypedDict):
    id: str
    name: str
    state: JobState
    createdAt: str
    completedAt: str | None


class JobsStatus(TypedDict):
    runner: Runner
    # None when the queue could not be read.
    jobs: list[JobRun] | None


class SampleJobQueued(TypedDict):
    # None when a repeat was ignored.
    id: str | None


def _iso(moment: datetime) -> str:
    """A UTC timestamp as JavaScript's toISOString writes it, such as 2026-01-31T09:30:00.000Z."""
    return moment.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _job_run(record: JobRecord) -> JobRun:
    return {
        "id": record.id,
        "name": record.name,
        "state": record.state,
        "createdAt": _iso(record.created_at),
        "completedAt": None if record.completed_at is None else _iso(record.completed_at),
    }


def jobs_router(*, jobs: BackgroundJobs, get_current_user: GetCurrentUser) -> APIRouter:
    """GET /api/jobs and POST /api/jobs/sample."""
    router = APIRouter()

    async def requester(request: Request) -> str:
        """Who the sample job runs for: the signed-in user's email, or "anonymous"."""
        user = await get_current_user(request)
        return user["email"] if user else "anonymous"

    @router.get("/api/jobs")
    async def jobs_status(request: Request) -> JSONResponse:
        runner = jobs.runner()
        status: JobsStatus = {"runner": runner, "jobs": None}
        try:
            recent = await jobs.queue().recent(
                sample_job, data={"requestedBy": await requester(request)}, limit=5
            )
            status["jobs"] = [_job_run(record) for record in recent]
        except Exception:
            logger.exception("Background jobs: could not list recent jobs.")
        return JSONResponse(status, headers=NO_STORE)

    @router.post("/api/jobs/sample", dependencies=[Depends(json_only)])
    async def queue_sample_job(request: Request) -> JSONResponse:
        requested_by = await requester(request)
        try:
            # Repeated clicks within seconds are ignored, and answer id None.
            job_id = await jobs.queue().enqueue(
                sample_job, {"requestedBy": requested_by}, key=requested_by, throttle_seconds=2
            )
        except Exception:
            logger.exception("Background jobs: could not queue the sample job.")
            raise ApiError(
                503, "unavailable", "Background jobs are unavailable.", headers=NO_STORE
            ) from None
        body: SampleJobQueued = {"id": job_id}
        return JSONResponse(body, status_code=202)

    return router

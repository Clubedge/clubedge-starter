"""Runs the jobs that are due, for a scheduler where no worker runs (JOBS_WORKER=off): call it on a
schedule with `Authorization: Bearer $CRON_SECRET`. Without CRON_SECRET it does not exist."""

import hmac

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from clubedge_api.http import NO_STORE, ApiError
from clubedge_api.routes.jobs import BackgroundJobs


def _is_authorized(header: str, secret: str) -> bool:
    return hmac.compare_digest(header.encode(), f"Bearer {secret}".encode())


def jobs_run_router(*, jobs: BackgroundJobs) -> APIRouter:
    """GET /api/jobs/run."""
    router = APIRouter()

    @router.get("/api/jobs/run")
    async def run_due_jobs(request: Request) -> JSONResponse:
        secret = jobs.cron_secret()
        if not secret:
            raise ApiError(404, "not_found", "No such API endpoint.")
        if not _is_authorized(request.headers.get("authorization", ""), secret):
            raise ApiError(
                401, "unauthorized", "Send the CRON_SECRET as a bearer token.", headers=NO_STORE
            )
        return JSONResponse(await jobs.queue().run_due(), headers=NO_STORE)

    return router

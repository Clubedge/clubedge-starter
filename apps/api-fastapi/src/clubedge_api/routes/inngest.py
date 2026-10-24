"""Inngest calls this endpoint to find the API's jobs (GET, PUT) and to run each one (POST), through
the frontend's proxy. Its signing key authenticates the calls, so the request goes to Inngest's
handler as it came: no JSON-only guard, and the body unread."""

from fastapi import APIRouter, Request, Response

from clubedge_api.http import ApiError
from clubedge_api.routes.jobs import BackgroundJobs


def inngest_router(*, jobs: BackgroundJobs) -> APIRouter:
    """GET, PUT, and POST /api/inngest."""
    router = APIRouter()

    @router.api_route("/api/inngest", methods=["GET", "PUT", "POST"])
    async def inngest_endpoint(request: Request) -> Response:
        handler = jobs.queue().handler
        if handler is None:
            raise ApiError(404, "not_found", "No such API endpoint.")
        return await handler(request)

    return router

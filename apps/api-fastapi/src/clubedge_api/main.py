"""The ASGI app uvicorn serves: clubedge_api.main:app."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from clubedge_api import background_jobs  # clubedge:only jobs!=none
from clubedge_api.app import create_app
from clubedge_api.server import dependencies

app = create_app(dependencies())
# create_app's own lifespan (flushing telemetry, for one) wraps this one, so what runs beside the
# requests stops before that.
app_lifespan = app.router.lifespan_context


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Starts what runs beside the requests, and stops it once the server has stopped taking
    them (a deploy's SIGTERM, or Ctrl+C)."""
    async with app_lifespan(app):
        # clubedge:if jobs!=none
        # Background jobs run in this process, unless JOBS_WORKER=off hands them to a scheduler.
        background_jobs.start_jobs_worker()
        # clubedge:end
        yield
        await background_jobs.stop_jobs_worker()  # clubedge:only jobs!=none


app.router.lifespan_context = lifespan

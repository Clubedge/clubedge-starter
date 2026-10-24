"""Background jobs run by Inngest, behind the provider-neutral JobQueue: the API sends an event per
job, and Inngest calls /api/inngest to run it, with retries and schedules. Inngest reaches the API
through the frontend's proxy, at FRONTEND_URL, so the API itself stays private."""

import asyncio
import logging
import os
from dataclasses import dataclass
from urllib.parse import urljoin, urlsplit

import httpx

from clubedge_api.job_queue import JobQueue
from clubedge_api.jobs import JOBS
from clubedge_api.jobs_inngest import InngestJobs
from clubedge_api.routes.jobs import BackgroundJobs, Runner
from clubedge_api.settings import get_settings

logger = logging.getLogger(__name__)

# In development the API asks the Dev Server to sync its jobs this many times, this often.
SYNC_TRIES = 30
SYNC_INTERVAL_SECONDS = 2


def _variable(name: str) -> str:
    get_settings()  # Locally, .env.local fills in what the environment doesn't set.
    return os.environ.get(name, "").strip()


def dev_server() -> bool | str:
    """The local Inngest Dev Server (pnpm jobs:dev): INNGEST_DEV=1, or its URL; unset, outside
    production (the API's image sets NODE_ENV=production). Otherwise the API talks to Inngest
    Cloud with INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY."""
    value = _variable("INNGEST_DEV")
    if not value:
        return _variable("NODE_ENV") != "production"
    if value.lower() in ("0", "false"):
        return False
    if value.lower() in ("1", "true"):
        return True
    return value


def _frontend_origin() -> str:
    """The frontend's origin: its proxy changes the host and protocol the API sees, so Inngest is
    told this one instead."""
    parts = urlsplit(get_settings().frontend_origin)
    return f"{parts.scheme}://{parts.netloc}"


@dataclass
class _State:
    queue: InngestJobs | None = None
    syncing: asyncio.Task[None] | None = None


_state = _State()


def get_jobs() -> JobQueue:
    """One client per process."""
    if _state.queue is None:
        _state.queue = InngestJobs(
            JOBS,
            dev=dev_server(),
            event_key=_variable("INNGEST_EVENT_KEY") or None,
            signing_key=_variable("INNGEST_SIGNING_KEY") or None,
            serve_origin=_frontend_origin(),
        )
    return _state.queue


def runner() -> Runner:
    return "service"


# What the routes need: server.py passes it to the app. No worker, so no CRON_SECRET.
background_jobs = BackgroundJobs(runner=runner, queue=get_jobs)


async def _sync(endpoint: str) -> None:
    problem = ""
    async with httpx.AsyncClient(timeout=10) as client:
        for _ in range(SYNC_TRIES):
            await asyncio.sleep(SYNC_INTERVAL_SECONDS)
            try:
                response = await client.put(endpoint)
            except httpx.HTTPError as error:
                # The frontend may not listen yet, or the Dev Server may not run.
                problem = str(error) or type(error).__name__
                continue
            if response.is_success:
                logger.info("Background jobs: synced with the Inngest Dev Server.")
                return
            problem = f"{response.status_code} {response.text[:200]}"
    logger.warning(
        "Background jobs: could not sync with the Inngest Dev Server; is pnpm jobs:dev running? %s",
        problem,
    )


def start_jobs_worker() -> None:
    """Inngest runs the jobs, so there is no worker to start. In development, once the API
    answers, it asks the Dev Server to sync its jobs (a PUT to /api/inngest through the frontend),
    so jobs run whichever of pnpm dev and pnpm jobs:dev started first."""
    try:
        if dev_server() is False:
            return
        endpoint = urljoin(_frontend_origin(), "/api/inngest")
    except Exception:
        logger.exception("Background jobs: could not sync with Inngest.")
        return
    _state.syncing = asyncio.create_task(_sync(endpoint))


async def stop_jobs_worker() -> None:
    """Stops syncing, and closes the client if this process created one."""
    if _state.syncing is not None:
        _state.syncing.cancel()
        await asyncio.gather(_state.syncing, return_exceptions=True)
        _state.syncing = None
    if _state.queue is not None:
        await _state.queue.stop()
        _state.queue = None

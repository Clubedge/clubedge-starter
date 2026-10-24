"""Background jobs stored in Redis through BullMQ, behind the provider-neutral JobQueue, and run by
a worker inside the API process: main.py starts it with the API and stops it on shutdown."""

import asyncio
import logging
import os
from dataclasses import dataclass

from clubedge_api.job_queue import JobQueue
from clubedge_api.jobs import JOBS
from clubedge_api.jobs_bullmq import BullMqJobs
from clubedge_api.routes.jobs import BackgroundJobs, Runner
from clubedge_api.settings import get_settings

logger = logging.getLogger(__name__)

# How long shutdown waits for running jobs before leaving them to BullMQ's stalled-job retries.
STOP_TIMEOUT_SECONDS = 25

# How long the worker waits before trying to start again while Redis doesn't answer.
RETRY_SECONDS = 5


def _variable(name: str) -> str:
    get_settings()  # Locally, .env.local fills in what the environment doesn't set.
    return os.environ.get(name, "").strip()


def is_worker_enabled() -> bool:
    """Whether this API runs a worker: yes, unless JOBS_WORKER=off hands the jobs to a scheduler."""
    value = _variable("JOBS_WORKER")
    if value not in ("", "on", "off"):
        raise ValueError(f'JOBS_WORKER must be "on" or "off", not "{value}".')
    return value != "off"


def cron_secret() -> str | None:
    """Authorizes /api/jobs/run, which runs due jobs where no worker runs; unset disables it."""
    secret = _variable("CRON_SECRET")
    if secret and len(secret) < 16:
        raise ValueError("CRON_SECRET must have 16 or more characters.")
    return secret or None


@dataclass
class _State:
    queue: BullMqJobs | None = None
    starting: asyncio.Task[None] | None = None


_state = _State()


def get_jobs() -> JobQueue:
    """One queue per process, shared with the worker."""
    if _state.queue is None:
        redis_url = _variable("REDIS_URL")
        if not redis_url:
            raise ValueError("REDIS_URL is required for background jobs.")
        # Jobs the worker runs at once: one in development keeps the log easy to follow. The
        # API's image sets NODE_ENV=production.
        concurrency = 4 if _variable("NODE_ENV") == "production" else 1
        _state.queue = BullMqJobs(
            redis_url, JOBS, worker=is_worker_enabled(), concurrency=concurrency
        )
    return _state.queue


def runner() -> Runner:
    return "worker" if is_worker_enabled() else "scheduler"


# What the routes need: server.py passes it to the app.
background_jobs = BackgroundJobs(runner=runner, queue=get_jobs, cron_secret=cron_secret)


def start_jobs_worker() -> None:
    """Starts the worker when this API should run one, retrying until Redis answers."""
    try:
        if not is_worker_enabled():
            return
        queue = get_jobs()
    except Exception:
        # Invalid configuration, such as a missing REDIS_URL, is reported once; the rest of the
        # API keeps serving instead of failing to start.
        logger.exception("Background jobs: the worker did not start.")
        return

    async def start() -> None:
        while True:
            try:
                await queue.start_worker()
                return
            except Exception:
                logger.exception(
                    "Background jobs: the worker could not start, retrying in %s seconds.",
                    RETRY_SECONDS,
                )
                await asyncio.sleep(RETRY_SECONDS)

    _state.starting = asyncio.create_task(start())


async def stop_jobs_worker() -> None:
    """Stops the worker, letting running jobs finish, if this process created a queue."""
    if _state.starting is not None:
        _state.starting.cancel()
        await asyncio.gather(_state.starting, return_exceptions=True)
        _state.starting = None
    if _state.queue is not None:
        queue, _state.queue = _state.queue, None
        try:
            await asyncio.wait_for(queue.stop(), STOP_TIMEOUT_SECONDS)
        except TimeoutError:
            logger.warning("Background jobs: running jobs did not finish before shutdown.")

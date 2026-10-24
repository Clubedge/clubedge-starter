"""The provider-neutral contract for background jobs (packages/jobs' JobQueue, in Python).

Each provider (jobs_bullmq.py, jobs_inngest.py) implements JobQueue, so job definitions, routes,
and the dashboard's jobs card never depend on one queue library.
"""

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Literal, Protocol, TypedDict

from fastapi import Request, Response

logger = logging.getLogger(__name__)

# A job's data: what it was enqueued with, stored as JSON.
JobData = dict[str, Any]
# What a run stores: an object or a list as it is, any other value as {"value": ...}, none as None.
JobOutput = dict[str, Any] | list[Any] | None
JobState = Literal["queued", "active", "retrying", "completed", "failed", "cancelled"]
# Answers a request a provider makes to the app (Inngest, at /api/inngest).
RequestHandler = Callable[[Request], Awaitable[Response]]


@dataclass(frozen=True)
class JobContext:
    id: str
    # 1 on the first run, 2 on the first retry, and so on.
    attempt: int


@dataclass(frozen=True)
class JobDefinition:
    """A job: `run` does the work, and an exception it raises fails the attempt."""

    # The queue name: letters, digits, dashes, underscores, and dots.
    name: str
    run: Callable[[JobData, JobContext], Awaitable[object]]
    # Retries after a failed attempt.
    retry_limit: int = 2
    # Seconds before a retry; doubles with each attempt when retry_backoff is set.
    retry_delay_seconds: int = 10
    retry_backoff: bool = False
    # Seconds an attempt may run before it is failed and retried.
    timeout_seconds: float = 300
    # A cron expression, such as "0 3 * * *" (UTC), to run the job on a schedule with empty data.
    schedule: str | None = None


@dataclass(frozen=True)
class JobRecord:
    id: str
    name: str
    state: JobState
    data: JobData
    # What run() returned, or the error of the last failed attempt.
    output: object
    attempts: int
    created_at: datetime
    completed_at: datetime | None


class DueJobsRun(TypedDict):
    """What run_due did: the jobs that finished, and every attempt that failed, retries included."""

    completed: int
    failed: int


class ErrorContext(TypedDict):
    job: str
    attempt: int


# Receives a provider's own errors (context None), and each failed job attempt.
OnError = Callable[[BaseException, ErrorContext | None], None]


def log_job_error(error: BaseException, context: ErrorContext | None) -> None:
    """Logs a failed attempt, or a provider's error, with its traceback."""
    message = f'Background job "{context["job"]}" failed' if context else "Background jobs error"
    logger.error(message, exc_info=error)


class JobQueue(Protocol):
    """Application code depends on this interface, never on a queue library."""

    @property
    def id(self) -> str:
        """Stored nowhere, but useful in logs, such as "bullmq"."""

    @property
    def handler(self) -> RequestHandler | None:
        """For providers that run jobs by calling the app (Inngest): answers their requests, at
        the app's /api/inngest. Queues that run jobs themselves have none."""

    async def enqueue(
        self,
        job: JobDefinition,
        data: Mapping[str, Any],
        *,
        delay_seconds: int = 0,
        key: str | None = None,
        throttle_seconds: int = 0,
    ) -> str | None:
        """Adds a job and returns its id. With `key` and `throttle_seconds`, at most one job with
        that key is accepted per window: a repeat returns None."""

    async def start_worker(self) -> None:
        """Starts running jobs and schedules in this process until stop()."""

    async def run_due(self, *, limit: int = 25) -> DueJobsRun:
        """Runs the jobs that are due now and returns, for a scheduler calling /api/jobs/run where
        no worker runs."""

    async def recent(
        self, job: JobDefinition, *, data: Mapping[str, object] | None = None, limit: int = 10
    ) -> list[JobRecord]:
        """A job's most recent runs, newest first, only those whose data contains `data`."""

    async def stop(self) -> None:
        """Stops the worker, letting running jobs finish, and closes connections."""


def job_output(value: object) -> JobOutput:
    """How a run's result is stored, as each provider stores it."""
    if value is None:
        return None
    if isinstance(value, Mapping):
        return dict(value)
    if isinstance(value, list | tuple):
        return list(value)
    return {"value": value}


def error_output(error: BaseException | str) -> dict[str, str]:
    """How a failed attempt is stored: the error's message."""
    return {"message": str(error)}


async def run_attempt(definition: JobDefinition, data: JobData, context: JobContext) -> JobOutput:
    """Runs one attempt of a job, the way every provider must: it fails once it runs past
    timeout_seconds. Returns the stored output; raises the attempt's error."""
    timeout = asyncio.timeout(definition.timeout_seconds)
    try:
        async with timeout:
            value = await definition.run(data, context)
    except TimeoutError:
        if not timeout.expired():
            raise
        raise TimeoutError(
            f'The job "{definition.name}" ran past {definition.timeout_seconds} seconds.'
        ) from None
    return job_output(value)


def matches(data: Mapping[str, object], wanted: Mapping[str, object] | None) -> bool:
    """Whether a job's data contains every entry of `wanted`."""
    return wanted is None or all(data.get(key) == value for key, value in wanted.items())


@dataclass
class _MemoryJob:
    id: str
    name: str
    state: JobState
    data: JobData
    output: object
    attempts: int
    created_at: float
    completed_at: float | None
    run_after: float
    key: str | None


def _when(seconds: float) -> datetime:
    return datetime.fromtimestamp(seconds, UTC)


class MemoryJobs:
    """Runs jobs in this process and keeps them in memory, for tests. Retries happen at once in
    run_due; start_worker runs due jobs every `poll_seconds`."""

    id = "memory"
    handler: RequestHandler | None = None

    def __init__(
        self,
        definitions: Sequence[JobDefinition],
        *,
        poll_seconds: float = 0.05,
        now: Callable[[], float] = time.time,
    ) -> None:
        self._by_name = {definition.name: definition for definition in definitions}
        self._poll_seconds = poll_seconds
        self._now = now
        self._next_id = 1
        self._polling: asyncio.Task[None] | None = None
        self.jobs: list[_MemoryJob] = []

    async def enqueue(
        self,
        job: JobDefinition,
        data: Mapping[str, Any],
        *,
        delay_seconds: int = 0,
        key: str | None = None,
        throttle_seconds: int = 0,
    ) -> str | None:
        if job.name not in self._by_name:
            raise ValueError(f'The job "{job.name}" is not defined.')
        now = self._now()
        if key and throttle_seconds:
            since = now - throttle_seconds
            if any(
                queued.name == job.name and queued.key == key and queued.created_at > since
                for queued in self.jobs
            ):
                return None
        queued = _MemoryJob(
            id=str(self._next_id),
            name=job.name,
            state="queued",
            data=dict(data),
            output=None,
            attempts=0,
            created_at=now,
            completed_at=None,
            run_after=now + delay_seconds,
            key=key,
        )
        self._next_id += 1
        self.jobs.append(queued)
        return queued.id

    async def _run_one(self, job: _MemoryJob) -> bool:
        definition = self._by_name[job.name]
        job.state = "active"
        job.attempts += 1
        try:
            job.output = await run_attempt(
                definition, job.data, JobContext(id=job.id, attempt=job.attempts)
            )
        except Exception as error:
            job.output = error_output(error)
            if job.attempts > definition.retry_limit:
                job.state = "failed"
                job.completed_at = self._now()
            else:
                job.state = "retrying"
            return False
        job.state = "completed"
        job.completed_at = self._now()
        return True

    def _next_due(self) -> _MemoryJob | None:
        now = self._now()
        for job in self.jobs:
            if job.state in ("queued", "retrying") and job.run_after <= now:
                return job
        return None

    async def run_due(self, *, limit: int = 25) -> DueJobsRun:
        completed = 0
        failed = 0
        while completed + failed < limit:
            job = self._next_due()
            if job is None:
                break
            if await self._run_one(job):
                completed += 1
            else:
                failed += 1
        return {"completed": completed, "failed": failed}

    async def start_worker(self) -> None:
        if self._polling is None:
            self._polling = asyncio.create_task(self._poll())

    async def _poll(self) -> None:
        while True:
            await self.run_due()
            await asyncio.sleep(self._poll_seconds)

    async def recent(
        self, job: JobDefinition, *, data: Mapping[str, object] | None = None, limit: int = 10
    ) -> list[JobRecord]:
        found = [
            queued
            for queued in reversed(self.jobs)
            if queued.name == job.name and matches(queued.data, data)
        ]
        return [
            JobRecord(
                id=queued.id,
                name=queued.name,
                state=queued.state,
                data=queued.data,
                output=queued.output,
                attempts=queued.attempts,
                created_at=_when(queued.created_at),
                completed_at=None if queued.completed_at is None else _when(queued.completed_at),
            )
            for queued in found[:limit]
        ]

    async def stop(self) -> None:
        if self._polling is not None:
            self._polling.cancel()
            await asyncio.gather(self._polling, return_exceptions=True)
            self._polling = None

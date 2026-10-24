"""Jobs stored in Redis through BullMQ, behind JobQueue.

BullMQ's Python library shares the Node library's Redis format and Lua scripts, so its queues are
the same as the TypeScript stacks' (packages/jobs-bullmq).
"""

import time
from collections.abc import Awaitable, Callable, Mapping, Sequence
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from bullmq import Queue, Worker  # type: ignore[import-untyped]
from redis.asyncio import Redis
from redis.asyncio.retry import Retry
from redis.backoff import ExponentialBackoff

from clubedge_api.job_queue import (
    DueJobsRun,
    ErrorContext,
    JobContext,
    JobData,
    JobDefinition,
    JobOutput,
    JobRecord,
    JobState,
    OnError,
    RequestHandler,
    error_output,
    log_job_error,
    matches,
    run_attempt,
)

# Finished jobs stay listed for a week (completed) or a month (failed), at most this many each.
KEEP_COMPLETED = {"age": 7 * 24 * 3600, "count": 1000}
KEEP_FAILED = {"age": 30 * 24 * 3600, "count": 1000}


def _waiting(job: Any) -> JobState:
    return "retrying" if job.attemptsMade > 0 else "queued"


def _active(job: Any) -> JobState:
    return "active"


def _completed(job: Any) -> JobState:
    return "completed"


def _failed(job: Any) -> JobState:
    return "failed"


# recent() reads each state's list and labels its jobs with that state.
LISTS: list[tuple[str, Callable[[Any], JobState]]] = [
    ("active", _active),
    ("waiting", _waiting),
    ("prioritized", _waiting),
    ("delayed", _waiting),
    ("completed", _completed),
    ("failed", _failed),
]


def _when(milliseconds: Any) -> datetime:
    return datetime.fromtimestamp(int(milliseconds) / 1000, UTC)


def _data(job: Any) -> JobData:
    return dict(job.data) if isinstance(job.data, dict) else {}


def _record(job: Any, state: JobState) -> JobRecord:
    output: object = None
    if state == "completed":
        output = job.returnvalue
    elif job.failedReason and state in ("failed", "retrying"):
        output = error_output(str(job.failedReason))
    finished = state in ("completed", "failed")
    return JobRecord(
        id=str(job.id),
        name=str(job.name),
        state=state,
        data=_data(job),
        output=output,
        attempts=int(job.attemptsStarted or job.attemptsMade),
        created_at=_when(job.timestamp),
        completed_at=_when(job.finishedOn or job.timestamp) if finished else None,
    )


class BullMqJobs:
    """Jobs stored in Redis through BullMQ, behind JobQueue. Each worker opens its own
    connections, as BullMQ needs; rediss:// URLs use TLS."""

    id = "bullmq"
    handler: RequestHandler | None = None

    def __init__(
        self,
        redis_url: str,
        jobs: Sequence[JobDefinition],
        *,
        worker: bool = False,
        prefix: str = "clubedge",
        concurrency: int = 1,
        on_error: OnError = log_job_error,
    ) -> None:
        """`worker`: whether this process may run a worker; processes that only enqueue, or call
        run_due, leave it off. `prefix`: the Redis key prefix for BullMQ's keys. `concurrency`:
        the jobs each worker runs at once."""
        if not redis_url:
            raise ValueError("Background jobs need a Redis URL.")
        self._redis_url = redis_url
        self._definitions = list(jobs)
        self._by_name = {definition.name: definition for definition in jobs}
        self._worker = worker
        self._prefix = prefix
        self._concurrency = concurrency
        self._on_error = on_error
        self._queues: dict[str, Any] = {}
        self._workers: list[Any] = []

    def _definition(self, name: str) -> JobDefinition:
        definition = self._by_name.get(name)
        if definition is None:
            raise ValueError(f'The job "{name}" is not defined.')
        return definition

    def _connection(self) -> Redis:
        # Requests add and list jobs on this connection, which gives up after a few quick retries,
        # so an unreachable Redis fails the request instead of holding it.
        return Redis.from_url(
            self._redis_url,
            decode_responses=True,
            retry=Retry(ExponentialBackoff(cap=0.5, base=0.05), 3),
        )

    def _queue(self, definition: JobDefinition) -> Any:
        queue = self._queues.get(definition.name)
        if queue is None:
            options = {"connection": self._connection(), "prefix": self._prefix}
            queue = Queue(definition.name, options)
            self._queues[definition.name] = queue
        return queue

    def _job_options(self, definition: JobDefinition) -> dict[str, Any]:
        """The retry and retention settings a definition gives each of its jobs."""
        return {
            "attempts": definition.retry_limit + 1,
            "backoff": {
                "type": "exponential" if definition.retry_backoff else "fixed",
                "delay": definition.retry_delay_seconds * 1000,
            },
            "removeOnComplete": KEEP_COMPLETED,
            "removeOnFail": KEEP_FAILED,
        }

    def _report(self, error: BaseException, context: ErrorContext | None) -> None:
        # A failing error reporter must not replace the job's own error.
        try:
            self._on_error(error, context)
        except Exception as failure:
            log_job_error(failure, None)

    def _bullmq_error(self, error: object, *details: object) -> None:
        """BullMQ's own errors, such as a lost connection."""
        self._report(error if isinstance(error, BaseException) else RuntimeError(str(error)), None)

    async def _sync_schedules(self) -> None:
        """Starts or stops each definition's cron schedule; BullMQ keeps one scheduler per job."""
        for definition in self._definitions:
            queue = self._queue(definition)
            if definition.schedule:
                await queue.upsertJobScheduler(
                    definition.name,
                    {"pattern": definition.schedule, "tz": "UTC"},
                    definition.name,
                    {},
                    self._job_options(definition),
                )
            else:
                await queue.removeJobScheduler(definition.name)

    async def _execute(self, definition: JobDefinition, job: Any) -> JobOutput:
        attempt = int(job.attemptsMade) + 1
        context = JobContext(id=str(job.id), attempt=attempt)
        try:
            return await run_attempt(definition, _data(job), context)
        except Exception as error:
            self._report(error, {"job": definition.name, "attempt": attempt})
            raise

    def _processor(self, definition: JobDefinition) -> Callable[[Any, str], Awaitable[JobOutput]]:
        async def process(job: Any, token: str) -> JobOutput:
            return await self._execute(definition, job)

        return process

    async def enqueue(
        self,
        job: JobDefinition,
        data: Mapping[str, Any],
        *,
        delay_seconds: int = 0,
        key: str | None = None,
        throttle_seconds: int = 0,
    ) -> str | None:
        definition = self._definition(job.name)
        job_id = str(uuid4())
        options = {**self._job_options(definition), "jobId": job_id}
        if delay_seconds:
            options["delay"] = delay_seconds * 1000
        if key:
            # A key alone allows one unfinished job per key; with throttle_seconds, one per window.
            deduplication: dict[str, Any] = {"id": f"{definition.name}:{key}"}
            if throttle_seconds:
                deduplication["ttl"] = throttle_seconds * 1000
            options["deduplication"] = deduplication
        added = await self._queue(definition).add(definition.name, dict(data), options)
        # A deduplicated add returns the job that is already there.
        return job_id if str(added.id) == job_id else None

    async def start_worker(self) -> None:
        if not self._worker:
            raise RuntimeError("Create the queue with worker=True to run a worker.")
        if self._workers:
            return
        await self._sync_schedules()
        for definition in self._definitions:
            instance = Worker(
                definition.name,
                self._processor(definition),
                {
                    "connection": self._redis_url,
                    "prefix": self._prefix,
                    "concurrency": self._concurrency,
                    "removeOnComplete": KEEP_COMPLETED,
                    "removeOnFail": KEEP_FAILED,
                },
            )
            instance.on("error", self._bullmq_error)
            self._workers.append(instance)

    async def run_due(self, *, limit: int = 25) -> DueJobsRun:
        await self._sync_schedules()
        completed = 0
        failed = 0
        for definition in self._definitions:
            if completed + failed >= limit:
                break
            # A worker without a processor: this process fetches and finishes each job itself,
            # renewing the lock of the one it runs as a running worker does.
            manual = Worker(
                definition.name,
                None,
                {"connection": self._redis_url, "prefix": self._prefix, "autorun": False},
            )
            manual.on("error", self._bullmq_error)
            manual.lockManager.start()
            token = str(uuid4())
            try:
                while completed + failed < limit:
                    job = await manual.getNextJob(token)
                    if not job:
                        break
                    manual.lockManager.track_job(job.id, token, round(time.time() * 1000))
                    try:
                        output = await self._execute(definition, job)
                    except Exception as error:
                        # Retries and backoff still apply: BullMQ moves the job back to waiting
                        # or delayed.
                        await job.moveToFailed(error, token, False)
                        failed += 1
                    else:
                        await job.moveToCompleted(output, token, False)
                        completed += 1
                    finally:
                        manual.lockManager.untrack_job(job.id)
            finally:
                await manual.close()
        return {"completed": completed, "failed": failed}

    async def recent(
        self, job: JobDefinition, *, data: Mapping[str, object] | None = None, limit: int = 10
    ) -> list[JobRecord]:
        queue = self._queue(job)
        records: list[JobRecord] = []
        for list_type, state in LISTS:
            for found in await queue.getJobs([list_type], 0, 199, False):
                if found and found.name == job.name and matches(_data(found), data):
                    records.append(_record(found, state(found)))
        records.sort(key=lambda record: record.created_at, reverse=True)
        return records[:limit]

    async def stop(self) -> None:
        workers, self._workers = self._workers, []
        for instance in workers:
            await instance.close()
        queues = list(self._queues.values())
        self._queues.clear()
        for queue in queues:
            await queue.close()

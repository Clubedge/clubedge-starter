"""The BullMQ provider against stand-ins for BullMQ's Queue and Worker, so no Redis is needed."""

import asyncio
from collections.abc import Callable, Iterator
from typing import Any

import pytest

from clubedge_api import jobs_bullmq
from clubedge_api.job_queue import ErrorContext, JobContext, JobData, JobDefinition
from clubedge_api.jobs_bullmq import BullMqJobs


class FakeJob:
    def __init__(
        self,
        job_id: str,
        name: str,
        data: JobData,
        *,
        attempts_made: int = 0,
        timestamp: int = 1_700_000_000_000,
        finished_on: int = 0,
        returnvalue: object = None,
        failed_reason: str | None = None,
    ) -> None:
        self.id = job_id
        self.name = name
        self.data = data
        self.attemptsMade = attempts_made
        self.attemptsStarted = 0
        self.timestamp = timestamp
        self.finishedOn = finished_on
        self.returnvalue = returnvalue
        self.failedReason = failed_reason
        self.finished: tuple[str, object] | None = None

    async def moveToCompleted(self, output: object, token: str, fetch_next: bool) -> None:
        self.finished = ("completed", output)

    async def moveToFailed(self, error: Exception, token: str, fetch_next: bool) -> None:
        self.finished = ("failed", str(error))


class FakeQueue:
    created: list["FakeQueue"] = []

    def __init__(self, name: str, options: dict[str, Any]) -> None:
        self.name = name
        self.options = options
        self.added: list[tuple[str, JobData, dict[str, Any]]] = []
        self.lists: dict[str, list[FakeJob]] = {}
        self.deduplicated: dict[str, str] = {}
        self.schedulers_removed: list[str] = []
        self.closed = False
        FakeQueue.created.append(self)

    async def add(self, name: str, data: JobData, options: dict[str, Any]) -> FakeJob:
        deduplication = options.get("deduplication")
        if deduplication and deduplication["id"] in self.deduplicated:
            return FakeJob(self.deduplicated[deduplication["id"]], name, data)
        if deduplication:
            self.deduplicated[deduplication["id"]] = options["jobId"]
        self.added.append((name, data, options))
        return FakeJob(options["jobId"], name, data)

    async def getJobs(self, types: list[str], start: int, end: int, asc: bool) -> list[FakeJob]:
        return list(self.lists.get(types[0], []))

    async def removeJobScheduler(self, scheduler_id: str) -> int:
        self.schedulers_removed.append(scheduler_id)
        return 1

    async def close(self) -> None:
        self.closed = True


class FakeLockManager:
    def __init__(self) -> None:
        self.tracked: list[str] = []
        self.started = False

    def start(self) -> None:
        self.started = True

    def track_job(self, job_id: str, token: str, timestamp: int) -> None:
        self.tracked.append(job_id)

    def untrack_job(self, job_id: str) -> None:
        self.tracked.remove(job_id)


class FakeWorker:
    created: list["FakeWorker"] = []
    # The jobs a processor-less worker hands out, per queue name.
    waiting: dict[str, list[FakeJob]] = {}

    def __init__(
        self,
        name: str,
        processor: Callable[[Any, str], Any] | None,
        options: dict[str, Any],
    ) -> None:
        self.name = name
        self.processor = processor
        self.options = options
        self.handlers: dict[str, Callable[..., None]] = {}
        self.lockManager = FakeLockManager()
        self.closed = False
        FakeWorker.created.append(self)

    def on(self, event: str, handler: Callable[..., None]) -> None:
        self.handlers[event] = handler

    async def getNextJob(self, token: str) -> FakeJob | None:
        queued = FakeWorker.waiting.get(self.name, [])
        return queued.pop(0) if queued else None

    async def close(self) -> None:
        self.closed = True


@pytest.fixture(autouse=True)
def fake_bullmq(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setattr(jobs_bullmq, "Queue", FakeQueue)
    monkeypatch.setattr(jobs_bullmq, "Worker", FakeWorker)
    yield
    FakeQueue.created.clear()
    FakeWorker.created.clear()
    FakeWorker.waiting.clear()


async def _greet(data: JobData, context: JobContext) -> dict[str, object]:
    return {"greeting": f"Hello, {data['user']}", "attempt": context.attempt}


async def _fail(data: JobData, context: JobContext) -> None:
    raise RuntimeError("boom")


GREET = JobDefinition(name="greet", run=_greet, retry_limit=3, retry_delay_seconds=5)
FAIL = JobDefinition(name="fail", run=_fail, retry_backoff=True)


def test_needs_a_redis_url() -> None:
    with pytest.raises(ValueError, match="Redis URL"):
        BullMqJobs("", [GREET])


def test_adds_jobs_with_their_retries_and_retention() -> None:
    queue = BullMqJobs("redis://127.0.0.1:6379", [GREET, FAIL])
    job_id = asyncio.run(queue.enqueue(GREET, {"user": "ada"}, delay_seconds=60))
    [created] = FakeQueue.created
    assert created.name == "greet"
    assert created.options["prefix"] == "clubedge"
    [(name, data, options)] = created.added
    assert (name, data) == ("greet", {"user": "ada"})
    assert options["jobId"] == job_id
    assert options["attempts"] == 4
    assert options["backoff"] == {"type": "fixed", "delay": 5000}
    assert options["delay"] == 60_000
    assert options["removeOnComplete"] == jobs_bullmq.KEEP_COMPLETED
    assert options["removeOnFail"] == jobs_bullmq.KEEP_FAILED
    assert "deduplication" not in options


def test_throttles_repeats_of_a_key() -> None:
    queue = BullMqJobs("redis://127.0.0.1:6379", [GREET])

    async def scenario() -> tuple[str | None, str | None]:
        first = await queue.enqueue(GREET, {"user": "ada"}, key="ada", throttle_seconds=2)
        second = await queue.enqueue(GREET, {"user": "ada"}, key="ada", throttle_seconds=2)
        return first, second

    first, second = asyncio.run(scenario())
    assert first is not None
    assert second is None
    [(_, _, options)] = FakeQueue.created[0].added
    assert options["deduplication"] == {"id": "greet:ada", "ttl": 2000}


def test_refuses_a_job_that_is_not_defined() -> None:
    queue = BullMqJobs("redis://127.0.0.1:6379", [GREET])
    with pytest.raises(ValueError, match="not defined"):
        asyncio.run(queue.enqueue(FAIL, {}))


def test_starts_a_worker_per_job_only_when_allowed() -> None:
    with pytest.raises(RuntimeError, match="worker=True"):
        asyncio.run(BullMqJobs("redis://127.0.0.1:6379", [GREET]).start_worker())

    queue = BullMqJobs("redis://127.0.0.1:6379", [GREET, FAIL], worker=True, concurrency=4)
    asyncio.run(queue.start_worker())
    assert [worker.name for worker in FakeWorker.created] == ["greet", "fail"]
    worker = FakeWorker.created[0]
    assert worker.options["connection"] == "redis://127.0.0.1:6379"
    assert worker.options["concurrency"] == 4
    assert "error" in worker.handlers
    # Jobs without a schedule have none in Redis either.
    assert [created.schedulers_removed for created in FakeQueue.created] == [["greet"], ["fail"]]


def test_runs_a_job_in_the_worker_and_reports_failed_attempts() -> None:
    reported: list[tuple[str, ErrorContext | None]] = []

    def on_error(error: BaseException, context: ErrorContext | None) -> None:
        reported.append((str(error), context))

    queue = BullMqJobs("redis://127.0.0.1:6379", [GREET, FAIL], worker=True, on_error=on_error)
    asyncio.run(queue.start_worker())
    greet, fail = FakeWorker.created
    assert greet.processor is not None and fail.processor is not None
    output = asyncio.run(greet.processor(FakeJob("1", "greet", {"user": "ada"}), "token"))
    assert output == {"greeting": "Hello, ada", "attempt": 1}
    with pytest.raises(RuntimeError, match="boom"):
        asyncio.run(fail.processor(FakeJob("2", "fail", {}, attempts_made=1), "token"))
    assert reported == [("boom", {"job": "fail", "attempt": 2})]


def ignore(error: BaseException, context: ErrorContext | None) -> None:
    pass


def test_runs_due_jobs_for_a_scheduler() -> None:
    queue = BullMqJobs("redis://127.0.0.1:6379", [GREET, FAIL], on_error=ignore)
    done = FakeJob("1", "greet", {"user": "ada"})
    broken = FakeJob("2", "fail", {})
    FakeWorker.waiting.update({"greet": [done], "fail": [broken]})
    assert asyncio.run(queue.run_due()) == {"completed": 1, "failed": 1}
    assert done.finished == ("completed", {"greeting": "Hello, ada", "attempt": 1})
    assert broken.finished == ("failed", "boom")
    for worker in FakeWorker.created:
        assert worker.processor is None
        assert worker.options["autorun"] is False
        assert worker.lockManager.started
        assert worker.lockManager.tracked == []
        assert worker.closed


def test_lists_recent_jobs_from_each_state_newest_first() -> None:
    queue = BullMqJobs("redis://127.0.0.1:6379", [GREET])
    asyncio.run(queue.recent(GREET))
    [created] = FakeQueue.created
    created.lists = {
        "completed": [
            FakeJob(
                "1",
                "greet",
                {"user": "ada"},
                timestamp=1_000,
                finished_on=2_000,
                returnvalue={"greeting": "Hello, ada"},
            )
        ],
        "failed": [FakeJob("2", "greet", {"user": "ada"}, timestamp=3_000, failed_reason="boom")],
        "delayed": [FakeJob("3", "greet", {"user": "ada"}, timestamp=4_000, attempts_made=1)],
        "waiting": [
            FakeJob("4", "greet", {"user": "ada"}, timestamp=5_000),
            FakeJob("5", "greet", {"user": "bob"}, timestamp=6_000),
        ],
    }
    jobs = asyncio.run(queue.recent(GREET, data={"user": "ada"}))
    assert [(job.id, job.state) for job in jobs] == [
        ("4", "queued"),
        ("3", "retrying"),
        ("2", "failed"),
        ("1", "completed"),
    ]
    assert jobs[2].output == {"message": "boom"}
    assert jobs[3].output == {"greeting": "Hello, ada"}
    completed_at = jobs[3].completed_at
    assert completed_at is not None
    assert completed_at.timestamp() == 2
    assert jobs[0].completed_at is None
    assert [job.id for job in asyncio.run(queue.recent(GREET, limit=1))] == ["5"]


def test_stops_its_workers_and_queues() -> None:
    queue = BullMqJobs("redis://127.0.0.1:6379", [GREET], worker=True)
    asyncio.run(queue.start_worker())
    asyncio.run(queue.stop())
    assert all(worker.closed for worker in FakeWorker.created)
    assert all(created.closed for created in FakeQueue.created)

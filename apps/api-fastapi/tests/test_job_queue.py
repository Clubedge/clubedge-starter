"""The provider-neutral job contract, through the memory queue the route tests use."""

import asyncio

import pytest

from clubedge_api.job_queue import (
    JobContext,
    JobData,
    JobDefinition,
    MemoryJobs,
    error_output,
    job_output,
    run_attempt,
)


async def _greet(data: JobData, context: JobContext) -> dict[str, object]:
    return {"greeting": f"Hello, {data['user']}", "attempt": context.attempt}


async def _fail(data: JobData, context: JobContext) -> None:
    raise RuntimeError(f"attempt {context.attempt} failed")


async def _hang(data: JobData, context: JobContext) -> None:
    await asyncio.sleep(10)


GREET = JobDefinition(name="greet", run=_greet)


class Clock:
    """A clock the test moves by hand."""

    def __init__(self) -> None:
        self.now = 1_000.0

    def __call__(self) -> float:
        return self.now


def test_runs_a_job_and_keeps_its_output() -> None:
    async def scenario() -> None:
        queue = MemoryJobs([GREET])
        job_id = await queue.enqueue(GREET, {"user": "ada"})
        assert await queue.run_due() == {"completed": 1, "failed": 0}
        [record] = await queue.recent(GREET)
        assert record.id == job_id
        assert record.state == "completed"
        assert record.output == {"greeting": "Hello, ada", "attempt": 1}
        assert record.attempts == 1
        assert record.completed_at is not None

    asyncio.run(scenario())


def test_retries_until_the_retry_limit_then_fails_with_the_error() -> None:
    async def scenario() -> None:
        failing = JobDefinition(name="fail", run=_fail, retry_limit=2)
        queue = MemoryJobs([failing])
        await queue.enqueue(failing, {})
        assert await queue.run_due() == {"completed": 0, "failed": 3}
        [record] = await queue.recent(failing)
        assert record.state == "failed"
        assert record.attempts == 3
        assert record.output == {"message": "attempt 3 failed"}

    asyncio.run(scenario())


def test_fails_an_attempt_that_runs_past_its_timeout() -> None:
    async def scenario() -> None:
        hanging = JobDefinition(name="hang", run=_hang, retry_limit=0, timeout_seconds=0.05)
        queue = MemoryJobs([hanging])
        await queue.enqueue(hanging, {})
        assert await queue.run_due() == {"completed": 0, "failed": 1}
        [record] = await queue.recent(hanging)
        assert record.state == "failed"
        assert record.output == {"message": 'The job "hang" ran past 0.05 seconds.'}

    asyncio.run(scenario())


def test_throttles_a_key_within_its_window() -> None:
    async def scenario() -> None:
        clock = Clock()
        queue = MemoryJobs([GREET], now=clock)
        first = await queue.enqueue(GREET, {"user": "ada"}, key="ada", throttle_seconds=2)
        assert first is not None
        assert await queue.enqueue(GREET, {"user": "ada"}, key="ada", throttle_seconds=2) is None
        assert await queue.enqueue(GREET, {"user": "bob"}, key="bob", throttle_seconds=2)
        clock.now += 3
        assert await queue.enqueue(GREET, {"user": "ada"}, key="ada", throttle_seconds=2)

    asyncio.run(scenario())


def test_waits_for_a_delayed_job() -> None:
    async def scenario() -> None:
        clock = Clock()
        queue = MemoryJobs([GREET], now=clock)
        await queue.enqueue(GREET, {"user": "ada"}, delay_seconds=60)
        assert await queue.run_due() == {"completed": 0, "failed": 0}
        clock.now += 61
        assert await queue.run_due() == {"completed": 1, "failed": 0}

    asyncio.run(scenario())


def test_lists_recent_runs_newest_first_by_data() -> None:
    async def scenario() -> None:
        queue = MemoryJobs([GREET])
        ids = [await queue.enqueue(GREET, {"user": user}) for user in ("ada", "bob", "ada")]
        listed = await queue.recent(GREET, data={"user": "ada"})
        assert [record.id for record in listed] == [ids[2], ids[0]]
        assert [record.id for record in await queue.recent(GREET, limit=1)] == [ids[2]]

    asyncio.run(scenario())


def test_refuses_a_job_that_is_not_defined() -> None:
    async def scenario() -> None:
        queue = MemoryJobs([GREET])
        with pytest.raises(ValueError, match="not defined"):
            await queue.enqueue(JobDefinition(name="stranger", run=_greet), {})

    asyncio.run(scenario())


def test_runs_due_jobs_in_a_worker_until_stopped() -> None:
    async def scenario() -> None:
        queue = MemoryJobs([GREET], poll_seconds=0.01)
        await queue.enqueue(GREET, {"user": "ada"})
        await queue.start_worker()
        for _ in range(100):
            if queue.jobs[0].state == "completed":
                break
            await asyncio.sleep(0.01)
        await queue.stop()
        assert queue.jobs[0].state == "completed"

    asyncio.run(scenario())


def test_stores_outputs_and_errors_as_every_provider_does() -> None:
    assert job_output(None) is None
    assert job_output({"a": 1}) == {"a": 1}
    assert job_output([1, 2]) == [1, 2]
    assert job_output("done") == {"value": "done"}
    assert error_output(ValueError("boom")) == {"message": "boom"}


def test_run_attempt_passes_the_context() -> None:
    output = asyncio.run(run_attempt(GREET, {"user": "ada"}, JobContext(id="1", attempt=2)))
    assert output == {"greeting": "Hello, ada", "attempt": 2}

"""The Inngest provider against a stand-in for Inngest's REST API, and with sent events recorded
instead of sent, so no Inngest server is needed."""

import asyncio
import dataclasses
import re
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import unquote

import httpx
import inngest
import pytest

from clubedge_api.job_queue import JobContext, JobData, JobDefinition
from clubedge_api.jobs_inngest import PENDING_SECONDS, InngestJobs, event_name
from clubedge_api.routes.jobs import BackgroundJobs
from tests.fakes import client


async def _greet(data: JobData, context: JobContext) -> dict[str, object]:
    return {"greeting": f"Hello, {data['user']}"}


GREET = JobDefinition(name="greet", run=_greet)


class FakeInngest:
    """Inngest's REST API with these events and runs, and the events the client sends."""

    def __init__(
        self,
        events: list[dict[str, Any]] | None = None,
        runs: dict[str, list[dict[str, Any]]] | None = None,
    ) -> None:
        self.events = events or []
        self.runs = runs or {}
        self.requests: list[tuple[str, dict[str, str]]] = []
        self.sent: list[inngest.Event] = []
        self.transport = httpx.MockTransport(self.handle)

    def handle(self, request: httpx.Request) -> httpx.Response:
        self.requests.append((request.url.path, dict(request.url.params)))
        if request.url.path == "/v1/events":
            return httpx.Response(200, json={"data": self.events, "metadata": {}})
        match = re.fullmatch(r"/v1/events/([^/]+)/runs", request.url.path)
        if match:
            runs = self.runs.get(unquote(match[1]), [])
            return httpx.Response(200, json={"data": runs, "metadata": {}})
        return httpx.Response(404, text="not found")

    async def send(
        self, events: inngest.Event | list[inngest.Event], *, skip_middleware: bool = False
    ) -> list[str]:
        batch = events if isinstance(events, list) else [events]
        self.sent.extend(batch)
        return [event.id for event in batch]

    def queue(self, monkeypatch: pytest.MonkeyPatch, **options: Any) -> InngestJobs:
        jobs = InngestJobs([GREET], dev="http://inngest.test", transport=self.transport, **options)
        monkeypatch.setattr(jobs.client, "send", self.send)
        return jobs


def minutes_ago(minutes: int) -> str:
    return (datetime.now(UTC) - timedelta(minutes=minutes)).isoformat()


def test_sends_one_event_per_job_delayed_with_ts(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = FakeInngest()
    queue = fake.queue(monkeypatch)
    job_id = asyncio.run(queue.enqueue(GREET, {"user": "ada"}, delay_seconds=60))
    [event] = fake.sent
    assert event.id == job_id
    assert event.name == event_name("greet")
    assert event.data == {"user": "ada"}
    assert event.ts > (datetime.now(UTC) + timedelta(seconds=50)).timestamp() * 1000


def test_throttles_by_key(monkeypatch: pytest.MonkeyPatch) -> None:
    fresh = FakeInngest()
    job_id = asyncio.run(
        fresh.queue(monkeypatch).enqueue(GREET, {"user": "ada"}, key="ada", throttle_seconds=60)
    )
    assert job_id is not None
    assert re.fullmatch(r"greet:ada:\d+", job_id)
    assert fresh.sent[0].data == {"user": "ada", "__clubedgeKey": "ada"}
    [(path, params)] = fresh.requests
    assert path == "/v1/events"
    assert params["name"] == event_name("greet")

    taken = FakeInngest(
        events=[
            {
                "internal_id": "e1",
                "id": "x",
                "name": event_name("greet"),
                "data": {"user": "ada", "__clubedgeKey": "ada"},
                "receivedAt": minutes_ago(0),
            }
        ]
    )
    throttled = taken.queue(monkeypatch)
    repeat = throttled.enqueue(GREET, {"user": "ada"}, key="ada", throttle_seconds=60)
    assert asyncio.run(repeat) is None
    assert taken.sent == []


def test_lists_recent_jobs_from_inngests_events_and_runs(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = FakeInngest(
        events=[
            {
                "internal_id": "e1",
                "id": "j1",
                "name": event_name("greet"),
                "data": {"user": "ada"},
                "received_at": minutes_ago(30),
            },
            {
                "internal_id": "e2",
                "id": "j2",
                "name": event_name("greet"),
                "data": {"user": "ada", "__clubedgeKey": "ada"},
                "received_at": minutes_ago(20),
            },
            {
                "internal_id": "e3",
                "id": "j3",
                "name": event_name("greet"),
                "data": {"user": "ada"},
                "receivedAt": minutes_ago(10),
            },
            {
                "internal_id": "e4",
                "id": "j4",
                "name": event_name("greet"),
                "data": {"user": "grace"},
                "received_at": minutes_ago(5),
            },
        ],
        runs={
            "e1": [
                {
                    "run_id": "r1",
                    "run_started_at": minutes_ago(29),
                    "ended_at": minutes_ago(28),
                    "status": "Completed",
                    "output": {"greeting": "Hello, ada"},
                }
            ],
            "e2": [
                {
                    "run_id": "r2",
                    "run_started_at": minutes_ago(19),
                    "ended_at": minutes_ago(18),
                    "status": "Failed",
                    "output": {"error": {"name": "Error", "message": "boom"}},
                }
            ],
        },
    )
    queue = fake.queue(monkeypatch)
    jobs = asyncio.run(queue.recent(GREET, data={"user": "ada"}))
    assert [(job.id, job.state) for job in jobs] == [
        ("j3", "queued"),
        ("j2", "failed"),
        ("j1", "completed"),
    ]
    assert jobs[1].output == {"message": "boom"}
    assert jobs[1].data == {"user": "ada"}
    assert jobs[1].attempts == 1
    assert jobs[2].output == {"greeting": "Hello, ada"}
    assert jobs[0].output is None
    assert jobs[0].attempts == 0
    assert jobs[0].completed_at is None
    limited = asyncio.run(queue.recent(GREET, data={"user": "ada"}, limit=1))
    assert [job.id for job in limited] == ["j3"]


def test_lists_a_job_it_just_enqueued_before_inngests_api_does(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    queue = FakeInngest().queue(monkeypatch)

    async def scenario() -> None:
        job_id = await queue.enqueue(GREET, {"user": "ada"})
        [job] = await queue.recent(GREET, data={"user": "ada"})
        assert (job.id, job.state, job.attempts, job.data) == (job_id, "queued", 0, {"user": "ada"})
        assert await queue.recent(GREET, data={"user": "grace"}) == []

    asyncio.run(scenario())


def test_forgets_old_pending_jobs_even_when_nobody_lists_them(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    queue = FakeInngest().queue(monkeypatch)

    async def scenario() -> None:
        old = await queue.enqueue(GREET, {"user": "ada"})
        assert old is not None
        pending = queue._pending[old]
        queue._pending[old] = dataclasses.replace(
            pending, created_at=pending.created_at - timedelta(seconds=PENDING_SECONDS + 1)
        )
        new = await queue.enqueue(GREET, {"user": "grace"})
        assert list(queue._pending) == [new]

    asyncio.run(scenario())


def test_sends_with_the_dev_servers_key_when_the_project_sets_an_empty_one(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # .env.example leaves INNGEST_EVENT_KEY empty, and the SDK falls back to the environment.
    monkeypatch.setenv("INNGEST_EVENT_KEY", "")
    jobs = InngestJobs([GREET], dev="http://inngest.test")
    request = jobs.client._build_send_request([inngest.Event(name="greet")])
    assert not isinstance(request, Exception)
    assert request.url.path == "/e/NO_EVENT_KEY_SET"


def test_has_no_worker_to_start_and_nothing_to_run_on_demand(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    queue = FakeInngest().queue(monkeypatch)
    asyncio.run(queue.start_worker())
    assert asyncio.run(queue.run_due()) == {"completed": 0, "failed": 0}


def test_refuses_a_job_that_is_not_defined(monkeypatch: pytest.MonkeyPatch) -> None:
    queue = FakeInngest().queue(monkeypatch)
    with pytest.raises(ValueError, match="not defined"):
        asyncio.run(queue.enqueue(JobDefinition(name="stranger", run=_greet), {}))


def test_serves_inngests_endpoint_with_every_job_as_a_function(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    queue = FakeInngest().queue(monkeypatch)
    api = client(jobs=BackgroundJobs(runner=lambda: "service", queue=lambda: queue))
    # The Dev Server reads this introspection to find the API's functions.
    response = api.get("/api/inngest")
    assert response.status_code == 200
    assert response.json()["function_count"] == 1

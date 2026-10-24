"""Jobs run by Inngest, behind JobQueue, plus the request handler Inngest calls.

Inngest runs jobs itself: the API sends an event per job, and Inngest calls the API's /api/inngest
endpoint (the handler below) to run it, with retries and cron schedules. Nothing runs in this
process between requests, so start_worker and run_due have no work to do.
"""

import asyncio
import time
from collections.abc import Collection, Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import quote
from uuid import uuid4

import httpx
import inngest
import inngest.fast_api
from fastapi import FastAPI, Request, Response
from fastapi.routing import APIRoute

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

# The key enqueue adds to an event's data to throttle repeats; never part of a job's data.
KEY = "__clubedgeKey"
DAY_MS = 24 * 3600 * 1000
# Jobs enqueued here stay listed this long, until Inngest's API lists their events.
PENDING_SECONDS = 60

STATES: dict[str, JobState] = {
    "running": "active",
    "completed": "completed",
    "failed": "failed",
    "cancelled": "cancelled",
    "canceled": "cancelled",
}

# The key the Inngest Dev Server accepts when the project sets none (the SDK's own default).
DEV_SERVER_EVENT_KEY = "NO_EVENT_KEY_SET"


def event_name(job: str) -> str:
    """The event that runs a job."""
    return f"clubedge/{job}"


def _without_key(data: Mapping[str, object] | None) -> JobData:
    """An event's data without the throttle key enqueue adds to it."""
    return {key: value for key, value in (data or {}).items() if key != KEY}


def _event_data(event: Mapping[str, Any]) -> Mapping[str, object]:
    data = event.get("data")
    return data if isinstance(data, Mapping) else {}


def _milliseconds(value: object) -> float:
    """A timestamp from Inngest's API in milliseconds since the epoch, or 0 without one."""
    if not isinstance(value, str) or not value:
        return 0
    try:
        return datetime.fromisoformat(value).timestamp() * 1000
    except ValueError:
        return 0


def _received(event: Mapping[str, Any]) -> float:
    """When Inngest received an event. The Dev Server and the API say received_at; the published
    spec says receivedAt."""
    return _milliseconds(event.get("received_at") or event.get("receivedAt"))


def _when(milliseconds: float) -> datetime:
    return datetime.fromtimestamp(milliseconds / 1000, UTC)


def _iso(milliseconds: float) -> str:
    """A time as JavaScript's toISOString writes it, as Inngest's API expects."""
    return _when(milliseconds).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _run_state(status: object) -> JobState:
    """A run's state (Running, Completed, Failed, or Cancelled); one Inngest hasn't started yet
    (Scheduled, Queued, ...) counts as queued."""
    return STATES.get(str(status).lower(), "queued")


def _failed_output(output: object) -> dict[str, str]:
    """A failed run's output holds the error; keep its message, as other providers store it."""
    message: object = None
    if isinstance(output, Mapping):
        error = output.get("error")
        message = error.get("message") if isinstance(error, Mapping) else None
        if message is None:
            message = output.get("message")
    return error_output(message if isinstance(message, str) else "The job failed.")


def _serve(
    client: inngest.Inngest, functions: list[inngest.Function[Any]], serve_origin: str | None
) -> RequestHandler:
    """Inngest's FastAPI handler, as a function of the request that routes/inngest.py calls."""
    app = FastAPI(openapi_url=None, docs_url=None, redoc_url=None)
    inngest.fast_api.serve(app, client, functions, serve_origin=serve_origin)
    endpoints = {
        method: route.endpoint
        for route in app.routes
        if isinstance(route, APIRoute)
        for method in route.methods or ()
    }

    async def handle(request: Request) -> Response:
        endpoint = endpoints.get(request.method)
        if endpoint is None:
            return Response(status_code=405)
        response = await endpoint(request)
        if not isinstance(response, Response):
            raise TypeError("Inngest's handler did not return a response.")
        return response

    return handle


@dataclass(frozen=True)
class _Pending:
    job: str
    data: JobData
    created_at: datetime


class InngestJobs:
    """Jobs run by Inngest, behind JobQueue, and `handler`, which answers Inngest's calls."""

    id = "inngest"

    def __init__(
        self,
        jobs: Sequence[JobDefinition],
        *,
        app_id: str = "clubedge",
        event_key: str | None = None,
        signing_key: str | None = None,
        dev: bool | str = False,
        serve_origin: str | None = None,
        on_error: OnError = log_job_error,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        """`event_key` sends events, and `signing_key` signs Inngest's calls to the API and
        authorizes reading runs, both in production. `dev`: the local Inngest Dev Server, True
        for http://localhost:8288 or its URL; False, the API talks to Inngest Cloud with the keys.
        `serve_origin`: the public origin Inngest reaches the API at, when a proxy in front of it
        changes the host or protocol it sees. `transport`: for tests, Inngest's REST API."""
        dev_url: str | None = None
        if dev is True:
            dev_url = "http://localhost:8288"
        elif isinstance(dev, str) and dev:
            dev_url = dev.rstrip("/")
        self._by_name = {definition.name: definition for definition in jobs}
        self._signing_key = signing_key
        self._on_error = on_error
        self.client = inngest.Inngest(
            app_id=app_id,
            # Without a key the SDK reads INNGEST_EVENT_KEY, and the empty line .env.example leaves
            # there would send events to /e/ with no key, which the Dev Server refuses; it takes
            # any key, so development names its placeholder.
            event_key=event_key or (DEV_SERVER_EVENT_KEY if dev_url else None),
            signing_key=signing_key,
            is_production=dev_url is None,
            api_base_url=dev_url,
            event_api_base_url=dev_url,
        )
        self.functions = [self._function(definition) for definition in jobs]
        self.handler: RequestHandler = _serve(self.client, self.functions, serve_origin)
        self._api_client = httpx.AsyncClient(
            base_url=dev_url or "https://api.inngest.com", timeout=10, transport=transport
        )
        self._pending: dict[str, _Pending] = {}

    def _definition(self, name: str) -> JobDefinition:
        definition = self._by_name.get(name)
        if definition is None:
            raise ValueError(f'The job "{name}" is not defined.')
        return definition

    def _report(self, error: BaseException, context: ErrorContext | None) -> None:
        # A failing error reporter must not replace the job's own error.
        try:
            self._on_error(error, context)
        except Exception as failure:
            log_job_error(failure, None)

    def _function(self, definition: JobDefinition) -> inngest.Function[Any]:
        # Inngest allows 0 to 20 retries.
        retries = max(0, min(definition.retry_limit, 20))
        triggers: list[inngest.TriggerCron | inngest.TriggerEvent] = [
            inngest.TriggerEvent(event=event_name(definition.name))
        ]
        if definition.schedule:
            triggers.append(inngest.TriggerCron(cron=f"TZ=UTC {definition.schedule}"))

        async def run(ctx: inngest.Context) -> JobOutput:
            attempt = ctx.attempt + 1
            context = JobContext(id=ctx.event.id or ctx.run_id, attempt=attempt)
            try:
                return await run_attempt(definition, _without_key(ctx.event.data), context)
            except Exception as error:
                self._report(error, {"job": definition.name, "attempt": attempt})
                # Retry after the definition's delay, doubled per attempt with retry_backoff,
                # rather than Inngest's own schedule; the last attempt fails with the job's error.
                if attempt <= retries and definition.retry_delay_seconds > 0:
                    factor = 2 ** (attempt - 1) if definition.retry_backoff else 1
                    delay = timedelta(seconds=definition.retry_delay_seconds * factor)
                    raise inngest.RetryAfterError(str(error), delay) from error
                raise

        register = self.client.create_function(
            fn_id=definition.name, retries=retries, trigger=triggers
        )
        return register(run)

    async def _api(self, path: str, params: Mapping[str, str] | None = None) -> Any:
        headers = {"accept": "application/json"}
        if self._signing_key:
            headers["authorization"] = f"Bearer {self._signing_key}"
        response = await self._api_client.get(path, params=params, headers=headers)
        if not response.is_success:
            raise RuntimeError(f"Inngest's API answered {response.status_code} for {path}.")
        return response.json()["data"]

    async def _events(self, job: JobDefinition, since: float) -> list[Mapping[str, Any]]:
        """The job's events received since `since` (milliseconds), newest first."""
        params = {"name": event_name(job.name), "received_after": _iso(since), "limit": "100"}
        found = await self._api("/v1/events", params)
        events = [event for event in found if isinstance(event, Mapping)]
        return sorted(events, key=_received, reverse=True)

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
        now = time.time() * 1000
        event_id = str(uuid4())
        if key:
            # Inngest drops a second event with the same id within 24 hours. With
            # throttle_seconds, the id names the window, and a recent event with the key means
            # this one is throttled.
            window = throttle_seconds * 1000 if throttle_seconds else DAY_MS
            try:
                recent = await self._events(definition, now - window)
            except Exception:
                recent = []
            if any(_event_data(event).get(KEY) == key for event in recent):
                return None
            event_id = f"{definition.name}:{key}:{int(now // window)}"
        await self.client.send(
            inngest.Event(
                id=event_id,
                name=event_name(definition.name),
                data={**data, KEY: key} if key else dict(data),
                ts=int(now) + delay_seconds * 1000 if delay_seconds else 0,
            )
        )
        # Inngest lists an event a moment after it accepts it: remember the job until then, so
        # the page that queued it can already show it. Expired entries go first, so jobs queued
        # while nobody reads the list (emails, with their content) don't pile up.
        self._forget_pending()
        self._pending[event_id] = _Pending(definition.name, dict(data), datetime.now(UTC))
        return event_id

    async def start_worker(self) -> None:
        """Inngest calls the API to run each job; there is no worker to start."""

    async def run_due(self, *, limit: int = 25) -> DueJobsRun:
        return {"completed": 0, "failed": 0}

    async def _record(self, job: JobDefinition, event: Mapping[str, Any]) -> JobRecord:
        internal_id = quote(str(event.get("internal_id", "")), safe="")
        try:
            runs = await self._api(f"/v1/events/{internal_id}/runs")
        except Exception:
            runs = []
        latest = max(
            (run for run in runs if isinstance(run, Mapping)),
            key=lambda run: _milliseconds(run.get("run_started_at")),
            default=None,
        )
        state: JobState = _run_state(latest.get("status")) if latest else "queued"
        output: object = None
        if latest and state == "completed":
            output = latest.get("output")
        elif latest and state == "failed":
            output = _failed_output(latest.get("output"))
        ended = _milliseconds(latest.get("ended_at")) if latest else 0
        return JobRecord(
            id=str(event.get("id", "")),
            name=job.name,
            state=state,
            data=_without_key(_event_data(event)),
            output=output,
            # Inngest's API reports runs, not attempts: a finished or running job counts one.
            attempts=1 if latest else 0,
            created_at=_when(_received(event)),
            completed_at=_when(ended) if ended else None,
        )

    async def recent(
        self, job: JobDefinition, *, data: Mapping[str, object] | None = None, limit: int = 10
    ) -> list[JobRecord]:
        week = 7 * DAY_MS
        events = await self._events(job, time.time() * 1000 - week)
        found = [event for event in events if matches(_event_data(event), data)][:limit]
        # Jobs this process enqueued that Inngest doesn't list yet, as queued.
        listed = {str(event.get("id")) for event in found}
        self._forget_pending(listed)
        waiting: list[JobRecord] = []
        for event_id, pending in self._pending.items():
            if pending.job == job.name and matches(pending.data, data):
                waiting.append(
                    JobRecord(
                        id=event_id,
                        name=pending.job,
                        state="queued",
                        data=pending.data,
                        output=None,
                        attempts=0,
                        created_at=pending.created_at,
                        completed_at=None,
                    )
                )
        records = await asyncio.gather(*(self._record(job, event) for event in found))
        everything = [*waiting, *records]
        everything.sort(key=lambda record: record.created_at, reverse=True)
        return everything[:limit]

    def _forget_pending(self, listed: Collection[str] = ()) -> None:
        """Drops the jobs Inngest now lists, and those remembered longer than PENDING_SECONDS."""
        now = datetime.now(UTC)
        for event_id, pending in list(self._pending.items()):
            if event_id in listed or (now - pending.created_at).total_seconds() > PENDING_SECONDS:
                del self._pending[event_id]

    async def stop(self) -> None:
        await self._api_client.aclose()

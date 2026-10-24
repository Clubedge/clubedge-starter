"""Sentry: server errors and traces, as packages/observability-sentry does for the TypeScript
apps. Sentry's own integrations trace what FastAPI, httpx, and Redis do, so those spans join the
same traces."""

import asyncio
import logging
from collections.abc import Iterator
from contextlib import contextmanager

import sentry_sdk
from sentry_sdk.integrations.logging import LoggingIntegration
from sentry_sdk.tracing import Span

from clubedge_api.telemetry import Attributes, log_attributes


class ErrorEvents(logging.Handler):
    """Sends logged errors to Sentry, tagged with their attributes."""

    def __init__(self) -> None:
        super().__init__(logging.ERROR)

    def emit(self, record: logging.LogRecord) -> None:
        # The SDK logs its own failures, such as an event Sentry refused: sending those would
        # fail in turn.
        if record.name.startswith("sentry_sdk"):
            return
        try:
            message = record.getMessage()
            tags = {key: str(value) for key, value in log_attributes(record).items()}
            error = record.exc_info[1] if record.exc_info else None
            if error is None:
                sentry_sdk.capture_message(message, level="error", tags=tags)
            else:
                sentry_sdk.capture_exception(error, tags=tags, extras={"message": message})
        except Exception:
            self.handleError(record)


class SentryObservability:
    """Server errors and traces sent to Sentry. `errors` sends the errors it is handed:
    observability.py hands it those logged anywhere in the API."""

    def __init__(self) -> None:
        self.errors = ErrorEvents()

    @contextmanager
    def traced(self, name: str, attributes: Attributes) -> Iterator[None]:
        # A child of the span in progress, such as the request's from Sentry's FastAPI
        # integration, or else a transaction of its own.
        span: Span = (
            sentry_sdk.start_span(name=name)
            if sentry_sdk.get_current_span() is not None
            else sentry_sdk.start_transaction(name=name)
        )
        with span:
            for key, value in attributes.items():
                span.set_data(key, value)
            yield

    async def flush(self) -> None:
        await asyncio.to_thread(sentry_sdk.flush, 2.0)


def create_sentry_observability(
    *,
    dsn: str,
    environment: str | None = None,
    release: str | None = None,
    traces_sample_rate: float | None = None,
) -> SentryObservability:
    """Starts Sentry's SDK for the project's `dsn`. `traces_sample_rate` is the share of requests
    traced, from 0 to 1 (default 0.1)."""
    sentry_sdk.init(
        dsn=dsn,
        environment=environment,
        release=release,
        traces_sample_rate=0.1 if traces_sample_rate is None else traces_sample_rate,
        # Keep user details, cookies, query strings, and request bodies out of what is sent.
        data_collection={
            "user_info": False,
            "cookies": {"mode": "off"},
            "url_query_params": {"mode": "off"},
            "http_bodies": [],
            # Sentry's own list for when personal data is off; omitted, it would filter nothing.
            "http_headers": {
                "request": {
                    "mode": "denylist",
                    "terms": ["forwarded", "-ip", "remote-", "via", "-user"],
                }
            },
            "database_query_data": False,
            "queues": False,
        },
        # Errors reach Sentry through ErrorEvents, tagged with their attributes; the other log
        # records stay breadcrumbs.
        integrations=[LoggingIntegration(event_level=None)],
    )
    return SentryObservability()

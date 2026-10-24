"""telemetry_sentry.py: what it hands Sentry's SDK, with the SDK's calls recorded in place of
sending anything."""

import logging
from typing import Any

import pytest
import sentry_sdk

from clubedge_api.telemetry_sentry import ErrorEvents, create_sentry_observability


def test_starts_the_sdk_without_personal_data(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    started: list[dict[str, Any]] = []

    def init(**options: Any) -> None:
        started.append(options)

    monkeypatch.setattr(sentry_sdk, "init", init)
    create_sentry_observability(dsn="https://public@sentry.example/1", release="v1")
    [options] = started
    assert options["dsn"] == "https://public@sentry.example/1"
    assert options["release"] == "v1"
    assert options["traces_sample_rate"] == 0.1
    assert options["data_collection"] == {
        "user_info": False,
        "cookies": {"mode": "off"},
        "url_query_params": {"mode": "off"},
        "http_bodies": [],
        "http_headers": {
            "request": {
                "mode": "denylist",
                "terms": ["forwarded", "-ip", "remote-", "via", "-user"],
            }
        },
        "database_query_data": False,
        "queues": False,
    }
    create_sentry_observability(dsn="https://public@sentry.example/1", traces_sample_rate=0)
    assert started[-1]["traces_sample_rate"] == 0


def test_sends_logged_errors_tagged_with_their_attributes(monkeypatch: pytest.MonkeyPatch) -> None:
    exceptions: list[tuple[BaseException, dict[str, Any]]] = []
    messages: list[tuple[str, dict[str, Any]]] = []

    def capture_exception(error: BaseException, **scope: Any) -> None:
        exceptions.append((error, scope))

    def capture_message(message: str, **scope: Any) -> None:
        messages.append((message, scope))

    monkeypatch.setattr(sentry_sdk, "capture_exception", capture_exception)
    monkeypatch.setattr(sentry_sdk, "capture_message", capture_message)
    handler = ErrorEvents()
    logger = logging.getLogger("tests.sentry")
    logger.addHandler(handler)
    try:
        error = ValueError("boom")
        logger.error("Browser error", exc_info=error, extra={"url.path": "/dashboard"})
        logger.error("Queue stalled")
        logger.warning("Not an error")
        handler.handle(logging.makeLogRecord({"name": "sentry_sdk.errors", "msg": "refused"}))
    finally:
        logger.removeHandler(handler)
    scope = {"tags": {"url.path": "/dashboard"}, "extras": {"message": "Browser error"}}
    assert exceptions == [(error, scope)]
    assert messages == [("Queue stalled", {"level": "error", "tags": {}})]

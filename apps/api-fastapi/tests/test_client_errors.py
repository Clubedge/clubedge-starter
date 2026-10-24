"""/api/client-errors, request tracing, and the provider's flush at shutdown, in process. The
shared contract suite checks the routes against the live server too (`pnpm test`)."""

import json
from collections.abc import Iterator
from contextlib import contextmanager

import pytest
from fastapi.testclient import TestClient

from clubedge_api.app import create_app
from clubedge_api.routes.client_errors import ClientError, parse_client_error_report
from clubedge_api.settings import ClientIpSettings
from clubedge_api.telemetry import Attributes, BrowserErrorReporting, log_attributes
from tests.fakes import client, dependencies


class MemoryObservability:
    """Keeps the spans it is asked for and counts its flushes, in place of a provider."""

    def __init__(self) -> None:
        self.spans: list[tuple[str, dict[str, str | bool | int | float]]] = []
        self.flushes = 0

    @contextmanager
    def traced(self, name: str, attributes: Attributes) -> Iterator[None]:
        try:
            yield
        finally:
            self.spans.append((name, dict(attributes)))

    async def flush(self) -> None:
        self.flushes += 1


def sentry_reporting() -> BrowserErrorReporting:
    return {"provider": "sentry", "dsn": "https://public@sentry.example/1"}


def report(message: str) -> dict[str, str]:
    return {
        "kind": "render",
        "name": "TypeError",
        "message": message,
        "path": "/dashboard?token=secret",
    }


def test_serves_the_browsers_reporting_settings_never_cached() -> None:
    response = client(browser_error_reporting=sentry_reporting).get("/api/client-errors")
    assert response.status_code == 200
    assert response.json() == {"provider": "sentry", "dsn": "https://public@sentry.example/1"}
    assert "no-store" in response.headers["cache-control"]
    # Without the composition root's settings, the browser reports nothing.
    assert client().get("/api/client-errors").json() == {"provider": "none"}


def test_reports_a_browser_error_with_its_page_path_without_the_query_string(
    caplog: pytest.LogCaptureFixture,
) -> None:
    response = client().post("/api/client-errors", json=report("Cannot read x"))
    assert response.status_code == 204
    [record] = [logged for logged in caplog.records if logged.getMessage() == "Browser error"]
    assert record.exc_info is not None
    error = record.exc_info[1]
    assert isinstance(error, ClientError)
    assert str(error) == "TypeError: Cannot read x"
    assert log_attributes(record) == {"url.path": "/dashboard", "browser.event": "render"}


def test_refuses_what_is_not_a_json_error_report_under_16_kib() -> None:
    api = client()
    url = "/api/client-errors"
    invalid = api.post(url, json={"kind": "error"})
    assert invalid.status_code == 400
    assert invalid.json()["error"]["code"] == "invalid_report"
    not_json = api.post(url, content="not json", headers={"content-type": "application/json"})
    assert not_json.status_code == 400
    assert api.post(url, json=report("x" * 20_000)).status_code == 413
    form = api.post(url, content=json.dumps(report("form")), headers={"content-type": "text/plain"})
    assert form.status_code == 415


def test_limits_each_address_to_30_reports_a_minute() -> None:
    # As behind the frontend's server, which sends the client's address in X-Forwarded-For.
    api = client(client_ip_settings=ClientIpSettings(trusted_hops=1))
    url = "/api/client-errors"
    sender = {"x-forwarded-for": "198.51.100.7"}
    for _ in range(30):
        assert api.post(url, json=report("again"), headers=sender).status_code == 204
    limited = api.post(url, json=report("again"), headers=sender)
    assert limited.status_code == 429
    assert limited.json()["error"]["code"] == "rate_limited"
    assert limited.headers["retry-after"]


def test_keeps_the_expected_fields_of_a_report_and_drops_the_query_string() -> None:
    body = {
        "kind": "error",
        "name": "TypeError",
        "message": "x is undefined",
        "stack": "at render (app.js:1:2)",
        "path": "/dashboard?token=secret#top",
        "cookie": "ignored",
    }
    assert parse_client_error_report(body) == {
        "kind": "error",
        "name": "TypeError",
        "message": "x is undefined",
        "stack": "at render (app.js:1:2)",
        "path": "/dashboard",
    }


def test_caps_long_fields_and_rejects_anything_else() -> None:
    capped = parse_client_error_report(
        {"kind": "unhandledrejection", "message": "m" * 5_000, "path": "/"}
    )
    assert capped is not None
    assert len(capped["message"]) == 1_000
    assert capped["name"] == "Error"
    rejected: list[object] = [
        None,
        [],
        "error",
        {"kind": "error", "message": " ", "path": "/"},
        {"kind": "other", "message": "m", "path": "/"},
        {"kind": ["error"], "message": "m", "path": "/"},
        {"kind": "error", "message": "m", "path": "https://evil.example/"},
    ]
    for body in rejected:
        assert parse_client_error_report(body) is None


def test_turns_a_report_into_an_error_with_the_browsers_stack() -> None:
    error = ClientError(
        {
            "kind": "error",
            "name": "TypeError",
            "message": "boom",
            "stack": "at a (b.js:1:1)",
            "path": "/",
        }
    )
    assert str(error) == "TypeError: boom"
    assert error.__notes__ == ["at a (b.js:1:1)"]


def test_traces_each_api_request_by_its_method_and_path() -> None:
    observability = MemoryObservability()
    client(observability=observability).get("/api/health?probe=1")
    attributes = {"http.request.method": "GET", "url.path": "/api/health"}
    assert observability.spans == [("GET /api/health", attributes)]


def test_reports_an_error_that_escapes_a_route_with_its_method_and_path(
    caplog: pytest.LogCaptureFixture,
) -> None:
    async def failing() -> bool:
        raise RuntimeError("database exploded")

    observability = MemoryObservability()
    app = create_app(dependencies(is_ready=failing, observability=observability))
    response = TestClient(app, raise_server_exceptions=False).get("/api/ready")
    assert response.status_code == 500
    assert response.json()["error"]["code"] == "internal_error"
    [record] = [logged for logged in caplog.records if logged.getMessage() == "Request failed"]
    assert log_attributes(record) == {"http.request.method": "GET", "url.path": "/api/ready"}
    assert observability.spans == [("GET /api/ready", log_attributes(record))]


def test_sends_what_the_provider_buffers_when_the_server_stops() -> None:
    observability = MemoryObservability()
    with client(observability=observability) as api:
        assert api.get("/api/health").status_code == 200
        assert observability.flushes == 0
    assert observability.flushes == 1

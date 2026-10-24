"""observability.py, whichever provider the project has: it stays off without its settings, and
an invalid setting leaves it off rather than stopping the server."""

from collections.abc import Iterator

import pytest

from clubedge_api.observability import browser_error_reporting, start_observability
from clubedge_api.telemetry import BrowserErrorReporting

VARIABLES = [
    "OTEL_EXPORTER_OTLP_ENDPOINT",
    "OTEL_EXPORTER_OTLP_HEADERS",
    "OTEL_SERVICE_NAME",
    "SENTRY_DSN",
    "SENTRY_ENVIRONMENT",
    "SENTRY_RELEASE",
    "SENTRY_TRACES_SAMPLE_RATE",
    "NODE_ENV",
]


@pytest.fixture(autouse=True)
def unset(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Each test starts without the providers' variables, and with nothing started."""
    for key in VARIABLES:
        monkeypatch.delenv(key, raising=False)
    start_observability.cache_clear()
    yield
    start_observability.cache_clear()


def test_stays_off_without_its_settings() -> None:
    assert start_observability("my-product") is None


def test_stays_off_when_its_settings_are_invalid(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "not a url")
    monkeypatch.setenv("SENTRY_DSN", "not a url")
    assert start_observability("my-product") is None
    assert "Observability did not start." in caplog.messages


def test_tells_the_browser_how_to_report_its_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SENTRY_DSN", "https://public@sentry.example/1")
    monkeypatch.setenv("SENTRY_RELEASE", "v1")
    # OpenTelemetry has the browser post its errors to /api/client-errors; Sentry has it send
    # them to Sentry directly.
    endpoint: BrowserErrorReporting = {"provider": "endpoint"}
    sentry: BrowserErrorReporting = {
        "provider": "sentry",
        "dsn": "https://public@sentry.example/1",
        "release": "v1",
    }
    assert browser_error_reporting() in (endpoint, sentry)

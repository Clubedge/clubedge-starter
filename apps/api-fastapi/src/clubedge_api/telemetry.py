"""What the observability providers share (telemetry_otel.py, telemetry_sentry.py): the
Observability protocol, how the browser reports its errors, and the attributes of logged errors.

The API reports an error by logging it at the ERROR level, such as with logger.exception(...),
and observability.py hands those records to the provider. What the code passed as `extra` are
the error's attributes: logger.exception("Request failed", extra={"url.path": "/api/ready"}).
"""

import logging
from collections.abc import Mapping
from contextlib import AbstractContextManager
from typing import Literal, NotRequired, Protocol, TypedDict
from urllib.parse import urlsplit

# Details worth attaching to a span or an error report, such as {"url.path": "/api/health"}.
Attributes = Mapping[str, str | bool | int | float]


class Observability(Protocol):
    """An observability provider, such as OpenTelemetry or Sentry, started by observability.py."""

    def traced(self, name: str, attributes: Attributes) -> AbstractContextManager[None]:
        """Runs the `with` block inside a span named `name`."""

    async def flush(self) -> None:
        """Sends what is still buffered, before the process exits."""


class EndpointReporting(TypedDict):
    """Post browser errors to /api/client-errors."""

    provider: Literal["endpoint"]


class SentryReporting(TypedDict):
    """Send browser errors to Sentry with its browser SDK; a DSN is public by design."""

    provider: Literal["sentry"]
    dsn: str
    environment: NotRequired[str]
    release: NotRequired[str]


class NoReporting(TypedDict):
    """Do not report browser errors."""

    provider: Literal["none"]


# How the browser reports its errors, served at runtime by /api/client-errors, so builds never
# bake in settings.
BrowserErrorReporting = EndpointReporting | SentryReporting | NoReporting

# The fields every log record has: any other field came from the `extra` it was logged with.
_RECORD_FIELDS = frozenset(vars(logging.makeLogRecord({}))) | {"message", "asctime"}


def log_attributes(record: logging.LogRecord) -> dict[str, str | bool | int | float]:
    """A logged error's attributes: the `extra` it was logged with, such as
    {"url.path": "/dashboard"}, keeping the values a provider can send."""
    return {
        key: value
        for key, value in vars(record).items()
        if key not in _RECORD_FIELDS and isinstance(value, str | bool | int | float)
    }


def send_logged_errors(handler: logging.Handler) -> None:
    """Hands `handler` the errors logged anywhere in the API, which still print as before."""
    root = logging.getLogger()
    if not root.handlers:
        # Python prints warnings and errors itself only while no handler is set: keep that.
        console = logging.StreamHandler()
        console.setLevel(logging.WARNING)
        root.addHandler(console)
    root.addHandler(handler)


def is_absolute_url(value: str) -> bool:
    """Whether `value` is an absolute URL, such as https://collector.example.com:4318."""
    try:
        parts = urlsplit(value)
    except ValueError:
        return False
    return bool(parts.scheme and parts.netloc)

"""Sentry: server errors and traces. Without a DSN, nothing is sent and errors stay in the server
log."""

import functools
import logging
import os
import re
from dataclasses import dataclass

from clubedge_api.telemetry import (
    BrowserErrorReporting,
    Observability,
    SentryReporting,
    is_absolute_url,
    send_logged_errors,
)
from clubedge_api.telemetry_sentry import create_sentry_observability

logger = logging.getLogger(__name__)

# A share of requests, from 0 to 1.
_SAMPLE_RATE = re.compile(r"0(\.\d+)?|1(\.0+)?")


@dataclass(frozen=True)
class _Settings:
    dsn: str | None
    environment: str | None
    release: str | None
    traces_sample_rate: float | None


def _env(key: str) -> str:
    return os.environ.get(key, "").strip()


def _settings() -> _Settings:
    """Sentry's variables, where an empty one is unset."""
    dsn = _env("SENTRY_DSN")
    if dsn and not is_absolute_url(dsn):
        raise ValueError("SENTRY_DSN must be an absolute URL.")
    rate = _env("SENTRY_TRACES_SAMPLE_RATE")
    if rate and not _SAMPLE_RATE.fullmatch(rate):
        raise ValueError("SENTRY_TRACES_SAMPLE_RATE must be a number from 0 to 1.")
    return _Settings(
        dsn=dsn or None,
        # As in the TypeScript apps, the environment is NODE_ENV unless it is set.
        environment=_env("SENTRY_ENVIRONMENT") or _env("NODE_ENV") or None,
        release=_env("SENTRY_RELEASE") or None,
        traces_sample_rate=float(rate) if rate else None,
    )


@functools.cache
def start_observability(service_id: str) -> Observability | None:
    """Starts the provider once per process, which server.py does before the first request. An
    invalid setting leaves observability off rather than stopping the server. Sentry names the
    service after the DSN's project, so `service_id` goes unused."""
    try:
        settings = _settings()
    except ValueError:
        logger.exception("Observability did not start.")
        return None
    if settings.dsn is None:
        return None
    provider = create_sentry_observability(
        dsn=settings.dsn,
        environment=settings.environment,
        release=settings.release,
        traces_sample_rate=settings.traces_sample_rate,
    )
    send_logged_errors(provider.errors)
    return provider


def browser_error_reporting() -> BrowserErrorReporting:
    """With a DSN, the browser reports its errors to Sentry directly; the DSN is public by
    design. An invalid setting leaves browser reporting off."""
    try:
        settings = _settings()
    except ValueError:
        return {"provider": "none"}
    if settings.dsn is None:
        return {"provider": "none"}
    reporting: SentryReporting = {"provider": "sentry", "dsn": settings.dsn}
    if settings.environment:
        reporting["environment"] = settings.environment
    if settings.release:
        reporting["release"] = settings.release
    return reporting

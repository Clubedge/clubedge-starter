"""OpenTelemetry: traces and error logs over OTLP/HTTP to any collector, such as Jaeger, Grafana
Cloud, or Honeycomb. Without an endpoint, nothing is sent and errors stay in the server log."""

import functools
import logging
import os

from clubedge_api.telemetry import (
    BrowserErrorReporting,
    Observability,
    is_absolute_url,
    send_logged_errors,
)
from clubedge_api.telemetry_otel import create_otel_observability, parse_otlp_headers

logger = logging.getLogger(__name__)


def _endpoint() -> str | None:
    """OTEL_EXPORTER_OTLP_ENDPOINT, or None when it is empty."""
    endpoint = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "").strip()
    if endpoint and not is_absolute_url(endpoint):
        raise ValueError("OTEL_EXPORTER_OTLP_ENDPOINT must be an absolute URL.")
    return endpoint or None


@functools.cache
def start_observability(service_id: str) -> Observability | None:
    """Starts the provider once per process, which server.py does before the first request. The
    service is named OTEL_SERVICE_NAME, or else `service_id`. An invalid setting leaves
    observability off rather than stopping the server."""
    try:
        endpoint = _endpoint()
    except ValueError:
        logger.exception("Observability did not start.")
        return None
    if endpoint is None:
        return None
    provider = create_otel_observability(
        service_name=os.environ.get("OTEL_SERVICE_NAME", "").strip() or service_id,
        endpoint=endpoint,
        headers=parse_otlp_headers(os.environ.get("OTEL_EXPORTER_OTLP_HEADERS")),
    )
    send_logged_errors(provider.errors)
    return provider


def browser_error_reporting() -> BrowserErrorReporting:
    """Browser errors go to /api/client-errors, which reports them like server errors."""
    return {"provider": "endpoint"}

"""OpenTelemetry: traces and error logs exported over OTLP/HTTP to any collector, as
packages/observability-otel does for the TypeScript apps. Each logged error is recorded on the
span it happened in and sent as an ERROR log record.

The providers stay this API's own rather than global: FastAPI traces requests itself once global
providers exist, and tracing.py traces them already.
"""

import asyncio
import logging
import traceback
from collections.abc import Iterator, Mapping
from contextlib import contextmanager
from urllib.parse import unquote

from opentelemetry import trace
from opentelemetry._logs import Logger, SeverityNumber
from opentelemetry.exporter.otlp.proto.http._log_exporter import OTLPLogExporter
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk._logs import LoggerProvider
from opentelemetry.sdk._logs.export import (
    BatchLogRecordProcessor,
    LogRecordExporter,
    SimpleLogRecordProcessor,
)
from opentelemetry.sdk.resources import SERVICE_NAME, Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, SimpleSpanProcessor, SpanExporter
from opentelemetry.trace import Status, StatusCode

from clubedge_api.telemetry import Attributes, log_attributes


def parse_otlp_headers(value: str | None) -> dict[str, str]:
    """Reads OTEL_EXPORTER_OTLP_HEADERS: "key=value,key2=value2", with URL-encoded values."""
    headers: dict[str, str] = {}
    for pair in (value or "").split(","):
        key, separator, encoded = pair.partition("=")
        if separator and key.strip():
            headers[key.strip()] = unquote(encoded.strip())
    return headers


def _describe(error: BaseException) -> dict[str, str]:
    """The error as OpenTelemetry's exception attributes."""
    return {
        "exception.type": type(error).__name__,
        "exception.message": str(error),
        "exception.stacktrace": "".join(traceback.format_exception(error)),
    }


def _record_on_span(span: trace.Span, error: BaseException) -> None:
    if span.is_recording():
        span.record_exception(error)
        span.set_status(Status(StatusCode.ERROR, str(error)))


class ErrorLogs(logging.Handler):
    """Sends logged errors as ERROR log records, each recorded on the span it happened in too."""

    def __init__(self, logger: Logger) -> None:
        super().__init__(logging.ERROR)
        self._logger = logger

    def emit(self, record: logging.LogRecord) -> None:
        # The SDK logs its own failures, such as an export the collector refused: sending those
        # would fail in turn.
        if record.name.startswith("opentelemetry"):
            return
        try:
            attributes = log_attributes(record)
            error = record.exc_info[1] if record.exc_info else None
            if error is not None:
                _record_on_span(trace.get_current_span(), error)
                attributes.update(_describe(error))
            self._logger.emit(
                timestamp=int(record.created * 1_000_000_000),
                severity_number=SeverityNumber.ERROR,
                severity_text="ERROR",
                body=record.getMessage(),
                attributes=attributes,
            )
        except Exception:
            self.handleError(record)


class OtelObservability:
    """Traces and error logs exported over OTLP/HTTP. `errors` sends the errors it is handed:
    observability.py hands it those logged anywhere in the API."""

    def __init__(self, tracer_provider: TracerProvider, logger_provider: LoggerProvider) -> None:
        self._tracer_provider = tracer_provider
        self._logger_provider = logger_provider
        self._tracer = tracer_provider.get_tracer("clubedge")
        self.errors = ErrorLogs(logger_provider.get_logger("clubedge"))

    @contextmanager
    def traced(self, name: str, attributes: Attributes) -> Iterator[None]:
        # An error that escapes the block is recorded on the span as it ends.
        with self._tracer.start_as_current_span(name, attributes=attributes):
            yield

    async def flush(self) -> None:
        await asyncio.to_thread(self._flush)

    def _flush(self) -> None:
        self._tracer_provider.force_flush(5_000)
        self._logger_provider.force_flush(5_000)


def create_otel_observability(
    *,
    service_name: str,
    endpoint: str | None = None,
    headers: Mapping[str, str] | None = None,
    span_exporter: SpanExporter | None = None,
    log_exporter: LogRecordExporter | None = None,
) -> OtelObservability:
    """Exports in batches to the collector at `endpoint`, such as http://localhost:4318, with
    `headers` on each export. For tests, `span_exporter` and `log_exporter` take each span and
    log record at once instead."""
    if not endpoint and (span_exporter is None or log_exporter is None):
        raise ValueError("OpenTelemetry needs an OTLP endpoint.")
    resource = Resource.create({SERVICE_NAME: service_name})
    tracer_provider = TracerProvider(resource=resource)
    logger_provider = LoggerProvider(resource=resource)
    if span_exporter is not None and log_exporter is not None:
        tracer_provider.add_span_processor(SimpleSpanProcessor(span_exporter))
        logger_provider.add_log_record_processor(SimpleLogRecordProcessor(log_exporter))
    else:
        base = (endpoint or "").rstrip("/")
        spans = OTLPSpanExporter(endpoint=f"{base}/v1/traces", headers=headers)
        logs = OTLPLogExporter(endpoint=f"{base}/v1/logs", headers=headers)
        tracer_provider.add_span_processor(BatchSpanProcessor(spans))
        logger_provider.add_log_record_processor(BatchLogRecordProcessor(logs))
    return OtelObservability(tracer_provider, logger_provider)

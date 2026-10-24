"""telemetry_otel.py: spans and error logs through OpenTelemetry's SDK, with exporters that keep
what they receive in place of a collector."""

import asyncio
import logging
from collections.abc import Iterator, Sequence

import pytest
from opentelemetry.sdk._logs import ReadableLogRecord
from opentelemetry.sdk._logs.export import LogRecordExporter, LogRecordExportResult
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from opentelemetry.trace import StatusCode

from clubedge_api.telemetry_otel import (
    OtelObservability,
    create_otel_observability,
    parse_otlp_headers,
)


class RecordedLogs(LogRecordExporter):
    """Keeps the log records it receives."""

    def __init__(self) -> None:
        self.records: list[ReadableLogRecord] = []

    def export(self, batch: Sequence[ReadableLogRecord]) -> LogRecordExportResult:
        self.records.extend(batch)
        return LogRecordExportResult.SUCCESS

    def shutdown(self) -> None:
        """Nothing to release."""

    def force_flush(self, timeout_millis: int = 30_000) -> bool:
        return True


class Otel:
    """A provider and what it exported."""

    def __init__(self) -> None:
        self.spans = InMemorySpanExporter()
        self.logs = RecordedLogs()
        self.observability: OtelObservability = create_otel_observability(
            service_name="my-product", span_exporter=self.spans, log_exporter=self.logs
        )


@pytest.fixture
def otel() -> Iterator[Otel]:
    """A provider whose handler receives what tests.otel logs."""
    otel = Otel()
    logger = logging.getLogger("tests.otel")
    logger.addHandler(otel.observability.errors)
    yield otel
    logger.removeHandler(otel.observability.errors)


def test_traces_spans_named_with_their_attributes(otel: Otel) -> None:
    attributes = {"http.request.method": "GET", "url.path": "/api/health"}
    with otel.observability.traced("GET /api/health", attributes):
        pass
    [span] = otel.spans.get_finished_spans()
    assert span.name == "GET /api/health"
    assert dict(span.attributes or {}) == attributes
    assert span.resource.attributes["service.name"] == "my-product"


def test_sends_logged_errors_as_error_logs_recorded_on_their_span(otel: Otel) -> None:
    logger = logging.getLogger("tests.otel")
    with otel.observability.traced("GET /api/ready", {}):
        try:
            raise RuntimeError("database exploded")
        except RuntimeError:
            logger.exception("Request failed", extra={"url.path": "/api/ready"})
    [record] = otel.logs.records
    assert record.log_record.body == "Request failed"
    assert record.log_record.severity_text == "ERROR"
    attributes = dict(record.log_record.attributes or {})
    assert attributes["url.path"] == "/api/ready"
    assert attributes["exception.type"] == "RuntimeError"
    assert attributes["exception.message"] == "database exploded"
    assert "database exploded" in str(attributes["exception.stacktrace"])
    [span] = otel.spans.get_finished_spans()
    assert span.status.status_code is StatusCode.ERROR
    assert [event.name for event in span.events] == ["exception"]
    context = span.get_span_context()
    assert context is not None
    assert record.log_record.trace_id == context.trace_id


def test_records_an_error_that_escapes_a_span(otel: Otel) -> None:
    with pytest.raises(RuntimeError), otel.observability.traced("job", {}):
        raise RuntimeError("job failed")
    [span] = otel.spans.get_finished_spans()
    assert span.status.status_code is StatusCode.ERROR


def test_leaves_out_the_sdks_own_failures(otel: Otel) -> None:
    record = logging.makeLogRecord({"name": "opentelemetry.exporter", "msg": "export failed"})
    otel.observability.errors.handle(record)
    assert otel.logs.records == []


def test_flushes_what_it_buffers(otel: Otel) -> None:
    asyncio.run(otel.observability.flush())


def test_reads_the_otlp_headers_variable() -> None:
    assert parse_otlp_headers("x-api-key=abc%20def, team = core,broken,=x") == {
        "x-api-key": "abc def",
        "team": "core",
    }
    assert parse_otlp_headers(None) == {}


def test_needs_an_endpoint_without_test_exporters() -> None:
    with pytest.raises(ValueError, match="endpoint"):
        create_otel_observability(service_name="my-product")

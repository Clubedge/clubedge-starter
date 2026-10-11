import { SpanStatusCode, trace, type Attributes, type Span } from "@opentelemetry/api";
import { logs, SeverityNumber } from "@opentelemetry/api-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  BatchLogRecordProcessor,
  LoggerProvider,
  SimpleLogRecordProcessor,
  type LogRecordExporter,
} from "@opentelemetry/sdk-logs";
import {
  BatchSpanProcessor,
  SimpleSpanProcessor,
  type SpanExporter,
} from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import {
  ATTR_EXCEPTION_MESSAGE,
  ATTR_EXCEPTION_STACKTRACE,
  ATTR_EXCEPTION_TYPE,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import type {
  ErrorContext,
  ObservabilityProvider,
  TelemetryAttributes,
} from "@clubedge/observability";

export interface OtelObservabilityConfig {
  /** The collector's OTLP/HTTP base URL, such as http://localhost:4318. */
  endpoint?: string;
  /** Sent with every export, such as an API key: { "x-api-key": "..." }. */
  headers?: Record<string, string>;
  serviceName: string;
  serviceVersion?: string;
  /** For tests: exporters to use instead of OTLP, with each span and record sent at once. */
  spanExporter?: SpanExporter;
  logExporter?: LogRecordExporter;
  /**
   * Makes this the process's global tracer, so framework spans (Next.js, pg-boss) join the same
   * traces. Default true; tests turn it off.
   */
  registerGlobally?: boolean;
}

/** Parses OTEL_EXPORTER_OTLP_HEADERS: "key=value,key2=value2", values URL-encoded. */
export function parseOtlpHeaders(value: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const pair of (value ?? "").split(",")) {
    const separator = pair.indexOf("=");
    if (separator <= 0) continue;
    headers[pair.slice(0, separator).trim()] = decodeURIComponent(pair.slice(separator + 1).trim());
  }
  return headers;
}

/** "http://collector:4318/" -> "http://collector:4318", without a regular expression. */
export function withoutTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url[end - 1] === "/") end--;
  return url.slice(0, end);
}

const toAttributes = (attributes: TelemetryAttributes = {}): Attributes =>
  Object.fromEntries(Object.entries(attributes).filter(([, value]) => value !== undefined));

function describeError(error: unknown) {
  const known = error instanceof Error ? error : new Error(String(error));
  return {
    [ATTR_EXCEPTION_TYPE]: known.name,
    [ATTR_EXCEPTION_MESSAGE]: known.message,
    ...(known.stack ? { [ATTR_EXCEPTION_STACKTRACE]: known.stack } : {}),
  };
}

/**
 * Traces and error logs exported over OTLP/HTTP to any OpenTelemetry collector. Errors are
 * recorded on the active span and sent as ERROR log records.
 */
export function createOtelObservability({
  endpoint,
  headers = {},
  serviceName,
  serviceVersion,
  spanExporter,
  logExporter,
  registerGlobally = true,
}: OtelObservabilityConfig): ObservabilityProvider {
  if (!endpoint && !(spanExporter && logExporter))
    throw new Error("OpenTelemetry needs an OTLP endpoint.");
  const base = withoutTrailingSlashes(endpoint ?? "");
  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
    ...(serviceVersion ? { [ATTR_SERVICE_VERSION]: serviceVersion } : {}),
  });

  const tracerProvider = new NodeTracerProvider({
    resource,
    spanProcessors: [
      spanExporter
        ? new SimpleSpanProcessor(spanExporter)
        : new BatchSpanProcessor(new OTLPTraceExporter({ url: `${base}/v1/traces`, headers })),
    ],
  });
  const loggerProvider = new LoggerProvider({
    resource,
    processors: [
      logExporter
        ? new SimpleLogRecordProcessor({ exporter: logExporter })
        : new BatchLogRecordProcessor({
            exporter: new OTLPLogExporter({ url: `${base}/v1/logs`, headers }),
          }),
    ],
  });
  if (registerGlobally) {
    tracerProvider.register();
    logs.setGlobalLoggerProvider(loggerProvider);
  }
  const tracer = tracerProvider.getTracer("clubedge");
  const logger = loggerProvider.getLogger("clubedge");

  function recordOnSpan(span: Span, error: unknown) {
    span.recordException(error instanceof Error ? error : String(error));
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: describeError(error)[ATTR_EXCEPTION_MESSAGE],
    });
  }

  return {
    id: "otel",

    reportError(error: unknown, context: ErrorContext = {}) {
      const active = trace.getActiveSpan();
      if (active) recordOnSpan(active, error);
      logger.emit({
        severityNumber: SeverityNumber.ERROR,
        severityText: "ERROR",
        body: context.message ?? describeError(error)[ATTR_EXCEPTION_MESSAGE],
        attributes: { ...toAttributes(context.attributes), ...describeError(error) },
      });
    },

    traced(name, run, attributes) {
      return tracer.startActiveSpan(
        name,
        { attributes: toAttributes(attributes) },
        async (span) => {
          try {
            return await run();
          } catch (error) {
            recordOnSpan(span, error);
            throw error;
          } finally {
            span.end();
          }
        },
      );
    },

    async flush() {
      await Promise.all([tracerProvider.forceFlush(), loggerProvider.forceFlush()]);
    },
  };
}

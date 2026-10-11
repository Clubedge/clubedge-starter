import type { ErrorContext, Telemetry, TelemetryAttributes } from "@clubedge/core";

// The provider-neutral contract. Each provider package (OpenTelemetry and Sentry today)
// implements ObservabilityProvider; the app installs it with @clubedge/core's setTelemetry, so
// code that reports errors or traces work never depends on one vendor.

export type { ErrorContext, TelemetryAttributes };

export interface ObservabilityProvider extends Telemetry {
  /** Such as "otel" or "sentry". */
  readonly id: string;
  /** Sends whatever is still buffered, for short-lived processes and shutdown. */
  flush(timeoutMs?: number): Promise<void>;
}

export interface RecordedSpan {
  name: string;
  attributes: TelemetryAttributes;
  /** The span this one ran inside, or null for a root span. */
  parent: string | null;
  error: unknown;
}

/** Keeps errors and spans in memory, for tests. */
export function createMemoryObservability(): ObservabilityProvider & {
  errors: Array<{ error: unknown; context: ErrorContext }>;
  spans: RecordedSpan[];
} {
  const errors: Array<{ error: unknown; context: ErrorContext }> = [];
  const spans: RecordedSpan[] = [];
  const open: string[] = [];

  return {
    id: "memory",
    errors,
    spans,
    reportError(error, context = {}) {
      errors.push({ error, context });
    },
    async traced(name, run, attributes = {}) {
      const span: RecordedSpan = { name, attributes, parent: open.at(-1) ?? null, error: null };
      open.push(name);
      try {
        return await run();
      } catch (error) {
        span.error = error;
        throw error;
      } finally {
        open.pop();
        spans.push(span);
      }
    },
    async flush() {},
  };
}

/** Request details worth attaching to a span or an error report, without query strings. */
export function requestAttributes(request: {
  method: string;
  url?: string;
  path?: string;
}): TelemetryAttributes {
  const path = request.path ?? (request.url ? new URL(request.url, "http://local").pathname : "");
  return { "http.request.method": request.method, "url.path": path.split("?")[0] };
}

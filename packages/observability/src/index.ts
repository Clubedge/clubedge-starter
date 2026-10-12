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

/** What the browser sends about an uncaught error or unhandled rejection. */
export interface ClientErrorReport {
  kind: "error" | "unhandledrejection";
  name: string;
  message: string;
  stack?: string;
  /** The page path, without its query string. */
  path: string;
}

const text = (value: unknown, limit: number) =>
  typeof value === "string" && value.trim() ? value.slice(0, limit) : undefined;

/**
 * Reads a report sent by the browser, keeping only the expected fields within size limits and
 * dropping query strings, which can carry tokens. Returns null for anything else.
 */
export function parseClientErrorReport(body: unknown): ClientErrorReport | null {
  if (typeof body !== "object" || body === null) return null;
  const input = body as Record<string, unknown>;
  const kind =
    input.kind === "unhandledrejection"
      ? "unhandledrejection"
      : input.kind === "error"
        ? "error"
        : null;
  const message = text(input.message, 1_000);
  const path = text(input.path, 300);
  if (!kind || !message || !path?.startsWith("/")) return null;
  return {
    kind,
    name: text(input.name, 100) ?? "Error",
    message,
    ...(text(input.stack, 8_000) ? { stack: text(input.stack, 8_000) } : {}),
    path: path.split(/[?#]/)[0]!,
  };
}

/** An error that happened in the browser, as a server-side Error for reporting. */
export class ClientError extends Error {
  override name = "ClientError";
  constructor(report: ClientErrorReport) {
    super(`${report.name}: ${report.message}`);
    this.stack = report.stack ? `${report.name}: ${report.message}\n${report.stack}` : this.message;
  }
}

/**
 * How the browser reports its errors, served at runtime by /api/client-errors so builds never
 * bake in settings: posted back to the server ("endpoint"), sent to Sentry, or not at all.
 */
export type BrowserErrorReporting =
  | { provider: "endpoint" }
  | { provider: "sentry"; dsn: string; environment?: string; release?: string }
  | { provider: "none" };

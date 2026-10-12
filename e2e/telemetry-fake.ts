import { createServer } from "node:http";
import { gunzipSync } from "node:zlib";

// A stand-in for an OpenTelemetry collector and for Sentry's ingestion API, for browser tests.
// It accepts OTLP/HTTP JSON at /v1/traces and /v1/logs and Sentry envelopes at
// /api/<project>/envelope/, and keeps the span names and error messages it receives.
// Point the app at it with OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4319 or
// SENTRY_DSN=http://public@127.0.0.1:4319/1.

export interface TelemetryFake {
  spans: string[];
  errors: string[];
  stop(): Promise<void>;
}

type OtlpValue = { stringValue?: string };
type OtlpTraces = {
  resourceSpans?: Array<{ scopeSpans?: Array<{ spans?: Array<{ name: string }> }> }>;
};
type OtlpLogs = {
  resourceLogs?: Array<{
    scopeLogs?: Array<{
      logRecords?: Array<{
        body?: OtlpValue;
        attributes?: Array<{ key: string; value: OtlpValue }>;
      }>;
    }>;
  }>;
};
type SentryItem = {
  type?: string;
  items?: Array<{ name: string }>;
  exception?: { values?: Array<{ value?: string }> };
};

export async function startTelemetryFake(port = 4319): Promise<TelemetryFake> {
  const spans: string[] = [];
  const errors: string[] = [];

  function receiveOtlp(path: string, body: string) {
    if (path === "/v1/traces") {
      const traces = JSON.parse(body) as OtlpTraces;
      for (const resource of traces.resourceSpans ?? [])
        for (const scope of resource.scopeSpans ?? [])
          for (const span of scope.spans ?? []) spans.push(span.name);
    } else if (path === "/v1/logs") {
      const logs = JSON.parse(body) as OtlpLogs;
      for (const resource of logs.resourceLogs ?? [])
        for (const scope of resource.scopeLogs ?? [])
          for (const record of scope.logRecords ?? []) {
            const message = record.attributes?.find((a) => a.key === "exception.message");
            errors.push(message?.value.stringValue ?? record.body?.stringValue ?? "");
          }
    }
  }

  function receiveEnvelope(body: string) {
    // An envelope is a header line, then pairs of item header and item payload lines.
    for (const line of body.split("\n").slice(1)) {
      if (!line.trim()) continue;
      const item = JSON.parse(line) as SentryItem;
      for (const span of item.items ?? []) spans.push(span.name);
      for (const value of item.exception?.values ?? []) errors.push(value.value ?? "");
    }
  }

  const server = createServer((request, response) => {
    // Sentry's browser SDK posts here from the app's origin.
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Headers", "*");
    if (request.method === "OPTIONS") {
      response.writeHead(204).end();
      return;
    }
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      try {
        const raw = Buffer.concat(chunks);
        const gzipped = request.headers["content-encoding"] === "gzip";
        const body = (gzipped ? gunzipSync(raw) : raw).toString("utf8");
        const path = new URL(request.url ?? "/", "http://fake").pathname;
        if (path.endsWith("/envelope/")) receiveEnvelope(body);
        else receiveOtlp(path, body);
        response.writeHead(200, { "Content-Type": "application/json" }).end("{}");
      } catch {
        response.writeHead(400).end();
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));

  return {
    spans,
    errors,
    stop: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

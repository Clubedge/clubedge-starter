import { createServer } from "node:http";
import { gunzipSync } from "node:zlib";

// A stand-in for an OpenTelemetry collector and for Sentry's ingestion API, for browser tests.
// It accepts OTLP/HTTP, in JSON (JavaScript SDKs) or protobuf (Python's), at /v1/traces and
// /v1/logs and Sentry envelopes at /api/<project>/envelope/, and keeps the span names and error
// messages it receives.
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
  // A transaction event, as Python's SDK sends its traces.
  transaction?: string;
  exception?: { values?: Array<{ value?: string }> };
};

/** The length-delimited fields numbered `field` in a protobuf message: messages and strings. */
function protobufFields(message: Buffer, field: number): Buffer[] {
  const found: Buffer[] = [];
  let offset = 0;
  const varint = () => {
    let value = 0;
    for (let shift = 0; ; shift += 7) {
      const byte = message[offset++]!;
      value += (byte & 0x7f) * 2 ** shift;
      if (byte < 0x80) return value;
    }
  };
  while (offset < message.length) {
    const key = varint();
    const wireType = key % 8;
    if (wireType === 0) varint();
    else if (wireType === 1) offset += 8;
    else if (wireType === 5) offset += 4;
    else if (wireType === 2) {
      const length = varint();
      if (Math.floor(key / 8) === field) found.push(message.subarray(offset, offset + length));
      offset += length;
    } else throw new Error(`unexpected protobuf wire type ${wireType}`);
  }
  return found;
}

const protobufText = (message: Buffer, field: number) =>
  protobufFields(message, field)[0]?.toString("utf8");

// AnyValue's string_value is its field 1.
const protobufValue = (message: Buffer | undefined): OtlpValue =>
  message ? { stringValue: protobufText(message, 1) } : {};

/** ExportTraceServiceRequest, as the JSON encoding's shape. */
const tracesFromProtobuf = (body: Buffer): OtlpTraces => ({
  resourceSpans: protobufFields(body, 1).map((resource) => ({
    scopeSpans: protobufFields(resource, 2).map((scope) => ({
      spans: protobufFields(scope, 2).map((span) => ({ name: protobufText(span, 5) ?? "" })),
    })),
  })),
});

/** ExportLogsServiceRequest, as the JSON encoding's shape. */
const logsFromProtobuf = (body: Buffer): OtlpLogs => ({
  resourceLogs: protobufFields(body, 1).map((resource) => ({
    scopeLogs: protobufFields(resource, 2).map((scope) => ({
      logRecords: protobufFields(scope, 2).map((record) => ({
        body: protobufValue(protobufFields(record, 5)[0]),
        attributes: protobufFields(record, 6).map((attribute) => ({
          key: protobufText(attribute, 1) ?? "",
          value: protobufValue(protobufFields(attribute, 2)[0]),
        })),
      })),
    })),
  })),
});

export async function startTelemetryFake(port = 4319): Promise<TelemetryFake> {
  const spans: string[] = [];
  const errors: string[] = [];

  function receiveOtlp(path: string, body: Buffer, protobuf: boolean) {
    if (path === "/v1/traces") {
      const traces = protobuf
        ? tracesFromProtobuf(body)
        : (JSON.parse(body.toString("utf8")) as OtlpTraces);
      for (const resource of traces.resourceSpans ?? [])
        for (const scope of resource.scopeSpans ?? [])
          for (const span of scope.spans ?? []) spans.push(span.name);
    } else if (path === "/v1/logs") {
      const logs = protobuf
        ? logsFromProtobuf(body)
        : (JSON.parse(body.toString("utf8")) as OtlpLogs);
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
      if (item.type === "transaction" && item.transaction) spans.push(item.transaction);
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
        const body = gzipped ? gunzipSync(raw) : raw;
        const path = new URL(request.url ?? "/", "http://fake").pathname;
        const protobuf = request.headers["content-type"] === "application/x-protobuf";
        if (path.endsWith("/envelope/")) receiveEnvelope(body.toString("utf8"));
        else receiveOtlp(path, body, protobuf);
        // An empty protobuf message is a successful export response.
        if (protobuf) response.writeHead(200, { "Content-Type": "application/x-protobuf" }).end();
        else response.writeHead(200, { "Content-Type": "application/json" }).end("{}");
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

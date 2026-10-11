import { InMemoryLogRecordExporter } from "@opentelemetry/sdk-logs";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import { describe, expect, it } from "vitest";
import { createOtelObservability, parseOtlpHeaders, withoutTrailingSlashes } from "./index";

function createProvider() {
  const spans = new InMemorySpanExporter();
  const logs = new InMemoryLogRecordExporter();
  const provider = createOtelObservability({
    serviceName: "test-app",
    spanExporter: spans,
    logExporter: logs,
    registerGlobally: false,
  });
  return { provider, spans, logs };
}

describe("createOtelObservability", () => {
  it("exports a span for traced work, with attributes and the service name", async () => {
    const { provider, spans } = createProvider();

    await expect(
      provider.traced("email.send", async () => "sent", { to: "a@example.com" }),
    ).resolves.toBe("sent");
    await provider.flush();

    const [span] = spans.getFinishedSpans();
    expect(span?.name).toBe("email.send");
    expect(span?.attributes).toEqual({ to: "a@example.com" });
    expect(span?.resource.attributes["service.name"]).toBe("test-app");
  });

  it("marks a failed span as an error and rethrows", async () => {
    const { provider, spans } = createProvider();

    await expect(
      provider.traced("payments.webhook", async () => {
        throw new Error("declined");
      }),
    ).rejects.toThrow("declined");

    const [span] = spans.getFinishedSpans();
    expect(span?.status).toMatchObject({ code: 2, message: "declined" });
    expect(span?.events[0]?.name).toBe("exception");
  });

  it("sends reported errors as ERROR log records with the exception", async () => {
    const { provider, logs } = createProvider();

    provider.reportError(new TypeError("bad input"), {
      message: "Payment webhook failed",
      attributes: { provider: "stripe", skipped: undefined },
    });
    await provider.flush();

    const [record] = logs.getFinishedLogRecords();
    expect(record?.severityText).toBe("ERROR");
    expect(record?.body).toBe("Payment webhook failed");
    expect(record?.attributes).toMatchObject({
      provider: "stripe",
      "exception.type": "TypeError",
      "exception.message": "bad input",
    });
    expect(record?.attributes).not.toHaveProperty("skipped");
  });

  it("needs an endpoint unless exporters are given", () => {
    expect(() => createOtelObservability({ serviceName: "app" })).toThrow("OTLP endpoint");
  });
});

describe("parseOtlpHeaders", () => {
  it("reads key=value pairs and decodes values", () => {
    expect(parseOtlpHeaders("x-api-key=abc%3D,  team = core ")).toEqual({
      "x-api-key": "abc=",
      team: "core",
    });
    expect(parseOtlpHeaders(undefined)).toEqual({});
    expect(parseOtlpHeaders("=nokey,novalue")).toEqual({});
    expect(parseOtlpHeaders("token=abc%")).toEqual({ token: "abc%" });
  });
});

describe("withoutTrailingSlashes", () => {
  it("removes trailing slashes only, quickly even for long runs", () => {
    expect(withoutTrailingSlashes("http://collector:4318/")).toBe("http://collector:4318");
    expect(withoutTrailingSlashes("http://collector:4318/otlp//")).toBe(
      "http://collector:4318/otlp",
    );
    expect(withoutTrailingSlashes("http://collector:4318")).toBe("http://collector:4318");
    expect(withoutTrailingSlashes("/".repeat(100_000) + "x")).toHaveLength(100_001);
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setTelemetry } from "@clubedge/core";
import { createMemoryObservability } from "@clubedge/observability";
import { createApp } from "@/app";

const observability = createMemoryObservability();

beforeAll(() => setTelemetry(observability));
afterAll(() => setTelemetry(null));

const app = createApp({
  serviceId: "my-product",
  isReady: async () => true,
  getCurrentUser: async () => null,
  browserErrorReporting: () => ({ provider: "sentry", dsn: "https://public@sentry.example/1" }),
  // As behind the frontend's server, which sends the client's address in x-forwarded-for.
  clientIpSettings: { trustedHops: 1 },
});

const post = (body: string, headers: Record<string, string> = {}) =>
  app.request("/api/client-errors", {
    method: "POST",
    body,
    headers: { "content-type": "application/json", ...headers },
  });

const report = (message: string) =>
  JSON.stringify({ kind: "render", name: "TypeError", message, path: "/dashboard?token=secret" });

describe("/api/client-errors", () => {
  it("serves the browser's reporting settings from the composition root", async () => {
    const response = await app.request("/api/client-errors");
    expect(await response.json()).toEqual({
      provider: "sentry",
      dsn: "https://public@sentry.example/1",
    });
  });

  it("reports a browser error with its page path, without the query string", async () => {
    expect((await post(report("Cannot read x"))).status).toBe(204);
    const reported = observability.errors.at(-1);
    expect(reported?.error).toMatchObject({
      name: "ClientError",
      message: "TypeError: Cannot read x",
    });
    expect(reported?.context.attributes).toEqual({
      "url.path": "/dashboard",
      "browser.event": "render",
    });
  });

  it("refuses what is not a JSON error report under 16 KiB", async () => {
    expect((await post("not json")).status).toBe(400);
    expect((await post(report("x".repeat(20_000)))).status).toBe(413);
    expect((await post(report("form"), { "content-type": "text/plain" })).status).toBe(415);
  });

  it("limits each address to 30 reports a minute", async () => {
    const from = { "x-forwarded-for": "198.51.100.7" };
    for (let sent = 0; sent < 30; sent++) await post(report("again"), from);
    const limited = await post(report("again"), from);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
  });
});

describe("request tracing", () => {
  it("traces each request by its method and path", async () => {
    await app.request("/api/health");
    expect(observability.spans.at(-1)).toMatchObject({
      name: "GET /api/health",
      attributes: { "http.request.method": "GET", "url.path": "/api/health" },
    });
  });

  it("reports an error that escapes a route with the request's method and path", async () => {
    const failing = createApp({
      serviceId: "my-product",
      isReady: async () => {
        throw new Error("database exploded");
      },
      getCurrentUser: async () => null,
    });
    expect((await failing.request("/api/ready")).status).toBe(500);
    expect(observability.errors.at(-1)).toMatchObject({
      context: {
        message: "Request failed",
        attributes: { "http.request.method": "GET", "url.path": "/api/ready" },
      },
    });
  });
});

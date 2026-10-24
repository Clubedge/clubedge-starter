// The behaviour every API stack must have, as one test suite over HTTP, so an API in any language
// is proven by passing it rather than by review:
//
//   describeApiConformance("hono", () => ({ request: (path, init) => app.request(path, init) }));
//
// TypeScript APIs can pass their fetch handler; others run src/remote.test.ts against a running
// server with API_URL set. It runs in Vitest, which is why it is a separate entry
// (`@clubedge/contract/conformance`) that only tests import.
import { describe, expect, it } from "vitest";

export interface ApiHarness {
  /** Sends a request to the API; `path` starts with /api. */
  request(path: string, init?: RequestInit): Response | Promise<Response>;
}

export interface ApiConformanceOptions {
  /** Skip the whole suite, for example when no API server is running. */
  skip?: boolean | string;
  /** The service id /api/health must report; any non-empty one when absent. */
  service?: string;
  /** Whether the API's database is reachable, so /api/ready must say so; either when absent. */
  ready?: boolean;
  /**
   * The option selected per module, as a generated project records it (package.json
   * `clubedge.modules`). The operations of a module that is missing or "none" must answer 404.
   */
  modules?: Record<string, string>;
}

/** An operation of the contract, as its method and path. */
export interface Operation {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
}

/**
 * The operations each module adds to the contract: those openapi.yaml tags with
 * `x-clubedge-module` (src/schema.test.ts keeps the two in step).
 */
export const moduleOperations: Record<string, Operation[]> = {
  observability: [
    { method: "GET", path: "/api/client-errors" },
    { method: "POST", path: "/api/client-errors" },
  ],
  jobs: [
    { method: "GET", path: "/api/jobs" },
    { method: "POST", path: "/api/jobs/sample" },
    { method: "GET", path: "/api/jobs/run" },
    { method: "GET", path: "/api/inngest" },
    { method: "PUT", path: "/api/inngest" },
    { method: "POST", path: "/api/inngest" },
  ],
  payments: [
    { method: "GET", path: "/api/billing" },
    { method: "POST", path: "/api/billing/checkout" },
    { method: "POST", path: "/api/billing/portal" },
    { method: "POST", path: "/api/webhooks/payments" },
  ],
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

async function json(response: Response) {
  expect(response.headers.get("content-type") ?? "", "a JSON response").toMatch(
    /^application\/json/,
  );
  return (await response.json()) as unknown;
}

/** A JSON not_found error, which is how an API answers a path it does not have. */
export async function expectNotFound(response: Response) {
  expect(response.status).toBe(404);
  expect(await json(response)).toEqual({
    error: { code: "not_found", message: expect.any(String) },
  });
}

/** A POST of `body` as JSON. */
const postJson = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

/** Whether the project has `module`, so its operations must work. */
const has = (options: ApiConformanceOptions, module: string) =>
  (options.modules?.[module] ?? "none") !== "none";

/** A request any route would accept as far as its content type goes, so only the path decides. */
function requestFor({ method, path }: Operation): [string, RequestInit] {
  if (method === "GET") return [path, { method }];
  return [path, { method, headers: { "content-type": "application/json" }, body: "{}" }];
}

export function describeApiConformance(
  api: string,
  setup: () => ApiHarness | Promise<ApiHarness>,
  options: ApiConformanceOptions = {},
) {
  const suite = options.skip ? describe.skip : describe;

  suite(`API contract: ${api}`, () => {
    it("reports liveness with the service id and the time", async () => {
      const harness = await setup();
      const response = await harness.request("/api/health");
      expect(response.status).toBe(200);
      const body = await json(response);
      expect(body).toMatchObject({ status: "ok", service: options.service ?? expect.any(String) });
      if (!isRecord(body)) throw new Error("health is not an object");
      expect(body.service).not.toBe("");
      expect(Number.isNaN(Date.parse(String(body.timestamp))), "timestamp is a date-time").toBe(
        false,
      );
    });

    it("reports readiness with a matching status code, never cached", async () => {
      const harness = await setup();
      const response = await harness.request("/api/ready");
      expect([200, 503]).toContain(response.status);
      if (options.ready !== undefined) expect(response.status).toBe(options.ready ? 200 : 503);
      expect(await json(response)).toEqual({
        status: response.status === 200 ? "ok" : "unavailable",
      });
      expect(response.headers.get("cache-control") ?? "").toContain("no-store");
    });

    it("returns the session, with no user when signed out", async () => {
      const harness = await setup();
      const response = await harness.request("/api/session");
      expect(response.status).toBe(200);
      expect(await json(response)).toEqual({ user: null });
    });

    it("answers unknown API paths with a JSON not_found error", async () => {
      const harness = await setup();
      await expectNotFound(await harness.request("/api/no-such-endpoint"));
    });

    // A module the project doesn't have leaves no endpoint behind.
    for (const [module, operations] of Object.entries(moduleOperations)) {
      if (has(options, module)) continue;
      it.each(operations)(
        `answers $method $path with not_found without ${module}`,
        async (operation) => {
          const harness = await setup();
          await expectNotFound(await harness.request(...requestFor(operation)));
        },
      );
    }

    // The modules the project has, as far as they work without their provider's service.
    describe.runIf(has(options, "observability"))("observability", () => {
      it("tells the browser how to report its errors, never cached", async () => {
        const harness = await setup();
        const response = await harness.request("/api/client-errors");
        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control") ?? "").toContain("no-store");
        const body = await json(response);
        expect(body).toMatchObject({ provider: expect.stringMatching(/^(endpoint|sentry|none)$/) });
        if (isRecord(body) && body.provider === "sentry") {
          expect(body.dsn).toEqual(expect.any(String));
        }
      });

      // Reported like any browser error, so the provider receives one named "Contract check".
      it("takes an error report from the browser", async () => {
        const harness = await setup();
        const report = { kind: "error", name: "Error", message: "Contract check", path: "/" };
        const response = await harness.request("/api/client-errors", postJson(report));
        expect(response.status).toBe(204);
      });

      it("refuses a body that is not an error report", async () => {
        const harness = await setup();
        const response = await harness.request("/api/client-errors", postJson({ kind: "error" }));
        expect(response.status).toBe(400);
        expect(await json(response)).toMatchObject({ error: { code: "invalid_report" } });
      });
    });

    describe.runIf(has(options, "jobs"))("jobs", () => {
      // Without a reachable queue the jobs are null, which is a valid answer too.
      it("says how jobs run and lists recent ones, never cached", async () => {
        const harness = await setup();
        const response = await harness.request("/api/jobs");
        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control") ?? "").toContain("no-store");
        const body = await json(response);
        expect(body).toMatchObject({
          runner: expect.stringMatching(/^(worker|scheduler|service)$/),
        });
        if (!isRecord(body)) throw new Error("jobs status is not an object");
        if (body.jobs !== null) {
          expect(Array.isArray(body.jobs), "jobs is an array or null").toBe(true);
          for (const job of body.jobs as unknown[]) {
            expect(job).toMatchObject({
              id: expect.any(String),
              name: expect.any(String),
              state: expect.stringMatching(/^(queued|active|retrying|completed|failed|cancelled)$/),
              createdAt: expect.any(String),
            });
          }
        }
      });

      it("queues the sample job only from JSON", async () => {
        const harness = await setup();
        const response = await harness.request("/api/jobs/sample", {
          method: "POST",
          headers: { "content-type": "text/plain" },
          body: "{}",
        });
        expect(response.status).toBe(415);
      });

      // 404 where CRON_SECRET is unset, or where the provider (Inngest) runs jobs itself.
      it("runs due jobs only for the scheduler holding CRON_SECRET", async () => {
        const harness = await setup();
        const response = await harness.request("/api/jobs/run", {
          headers: { authorization: "Bearer not-the-cron-secret" },
        });
        expect([401, 404]).toContain(response.status);
        expect(await json(response)).toMatchObject({ error: { code: expect.any(String) } });
      });
    });

    describe.runIf(has(options, "payments"))("payments", () => {
      it("lists the plans, with no subscription when signed out, never cached", async () => {
        const harness = await setup();
        const response = await harness.request("/api/billing");
        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control") ?? "").toContain("no-store");
        const body = await json(response);
        expect(body).toMatchObject({ configured: expect.any(Boolean), subscription: null });
        if (!isRecord(body) || !Array.isArray(body.plans)) throw new Error("plans is not a list");
        for (const plan of body.plans) {
          expect(plan).toEqual({
            id: expect.any(String),
            name: expect.any(String),
            description: expect.any(String),
          });
        }
      });

      // Signed out: 401, or 503 first while the provider's keys are unset.
      it.each(["/api/billing/checkout", "/api/billing/portal"])(
        "refuses POST %s when signed out",
        async (path) => {
          const harness = await setup();
          const response = await harness.request(path, postJson({ planId: "pro" }));
          expect([401, 503]).toContain(response.status);
          expect(await json(response)).toMatchObject({
            error: { code: response.status === 401 ? "unauthorized" : "not_configured" },
          });
        },
      );

      it("refuses a webhook without the provider's signature", async () => {
        const harness = await setup();
        const response = await harness.request(
          "/api/webhooks/payments",
          postJson({ id: "evt_contract_check", type: "customer.subscription.created" }),
        );
        expect([400, 503]).toContain(response.status);
        expect(await json(response)).toMatchObject({
          error: { code: response.status === 400 ? "invalid_signature" : "not_configured" },
        });
      });
    });
  });
}

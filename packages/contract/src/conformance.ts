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
export const moduleOperations: Record<string, Operation[]> = {};

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
      if ((options.modules?.[module] ?? "none") !== "none") continue;
      it.each(operations)(
        `answers $method $path with not_found without ${module}`,
        async (operation) => {
          const harness = await setup();
          await expectNotFound(await harness.request(...requestFor(operation)));
        },
      );
    }
  });
}

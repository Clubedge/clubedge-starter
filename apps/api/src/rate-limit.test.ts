import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RateLimiter } from "@clubedge/cache";
import { createMemoryLimiter, rateLimit, type RateLimitOptions } from "@/rate-limit";

const unavailable: RateLimiter = {
  limit: async () => {
    throw new Error("Redis is down");
  },
};

const appWith = (limiter: RateLimiter, options: Omit<RateLimitOptions, "scope"> = {}) =>
  new Hono().get("/", rateLimit(limiter, { scope: "test", ...options }), (c) => c.text("ok"));

const from = (address: string) => ({ headers: { "x-forwarded-for": address } });
// One proxy in front, which appends the address it saw to whatever the client sent.
const behindOneProxy = { clientIpSettings: { trustedHops: 1 } };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("rateLimit", () => {
  it("answers 429 with Retry-After once a client has used its requests", async () => {
    const app = appWith(createMemoryLimiter(2, 60), behindOneProxy);
    expect((await app.request("/", from("203.0.113.1"))).status).toBe(200);
    expect((await app.request("/", from("203.0.113.1"))).status).toBe(200);
    const limited = await app.request("/", from("203.0.113.1"));
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
    expect(Number(limited.headers.get("retry-after"))).toBeLessThanOrEqual(60);
    expect(await limited.json()).toMatchObject({ error: { code: "rate_limited" } });
    // Another address has its own count.
    expect((await app.request("/", from("203.0.113.2"))).status).toBe(200);
  });

  it("counts the address the proxy added, whatever the client put before it", async () => {
    const app = appWith(createMemoryLimiter(1, 60), behindOneProxy);
    expect((await app.request("/", from("198.51.100.1, 203.0.113.1"))).status).toBe(200);
    expect((await app.request("/", from("198.51.100.2, 203.0.113.1"))).status).toBe(429);
  });

  it("trusts the nearest proxy for a request with no connection address", async () => {
    // app.request has no connection, so the last entry, the nearest proxy's, counts; the client
    // cannot pick another count by changing the entries before it.
    const app = appWith(createMemoryLimiter(1, 60));
    expect((await app.request("/", from("198.51.100.66, 203.0.113.1"))).status).toBe(200);
    expect((await app.request("/", from("198.51.100.67, 203.0.113.1"))).status).toBe(429);
  });

  it("counts by the connection's address when the Node.js server serves the API", async () => {
    const seen: string[] = [];
    const recording: RateLimiter = {
      limit: async (identifier) => {
        seen.push(identifier);
        return { success: true, limit: 10, remaining: 9, resetAt: Date.now() + 60_000 };
      },
    };
    const server = serve({ fetch: appWith(recording).fetch, hostname: "127.0.0.1", port: 0 });
    await once(server, "listening");
    const { port } = server.address() as AddressInfo;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`, from("198.51.100.1"));
      expect(response.status).toBe(200);
    } finally {
      server.close();
    }
    expect(seen).toEqual(["test:127.0.0.1"]);
  });

  it("lets requests through when the limiter fails, unless it fails closed", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await appWith(unavailable).request("/")).status).toBe(200);
    const refused = await appWith(unavailable, { failOpen: false }).request("/");
    expect(refused.status).toBe(503);
    expect(await refused.json()).toMatchObject({ error: { code: "unavailable" } });
    expect(log).toHaveBeenCalled();
  });
});

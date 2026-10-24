import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RateLimiter } from "@clubedge/cache";
import { createMemoryLimiter, rateLimit } from "@/rate-limit";

const unavailable: RateLimiter = {
  limit: async () => {
    throw new Error("Redis is down");
  },
};

const appWith = (limiter: RateLimiter, failOpen?: boolean) =>
  new Hono().get("/", rateLimit(limiter, { scope: "test", failOpen }), (c) => c.text("ok"));

const from = (address: string) => ({ headers: { "x-forwarded-for": address } });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("rateLimit", () => {
  it("answers 429 with Retry-After once a client has used its requests", async () => {
    const app = appWith(createMemoryLimiter(2, 60));
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

  it("lets requests through when the limiter fails, unless it fails closed", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await appWith(unavailable).request("/")).status).toBe(200);
    const refused = await appWith(unavailable, false).request("/");
    expect(refused.status).toBe(503);
    expect(await refused.json()).toMatchObject({ error: { code: "unavailable" } });
    expect(log).toHaveBeenCalled();
  });
});

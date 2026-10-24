import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const redis = vi.hoisted(() => ({
  limit: vi.fn(async () => ({ success: true, limit: 2, remaining: 1, resetAt: 0 })),
  createRedisRateLimiter: vi.fn(),
  createRedisCache: vi.fn(),
}));

vi.mock("@clubedge/cache-redis", () => ({
  createRedisRateLimiter: redis.createRedisRateLimiter,
  createRedisCache: redis.createRedisCache,
}));

async function loadFreshModule() {
  vi.resetModules();
  return import("./cache");
}

beforeEach(() => {
  vi.clearAllMocks();
  redis.createRedisRateLimiter.mockReturnValue({ limit: redis.limit });
  redis.createRedisCache.mockReturnValue({ get: vi.fn(async () => "cached"), set: vi.fn() });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("cache composition root", () => {
  it("limits and caches in memory while REDIS_URL is empty", async () => {
    vi.stubEnv("REDIS_URL", "");
    const { cacheGet, cacheSet, createRateLimiter } = await loadFreshModule();
    const limiter = createRateLimiter(1, 60);

    expect((await limiter.limit("client")).success).toBe(true);
    expect((await limiter.limit("client")).success).toBe(false);
    await cacheSet("key", { value: 1 }, 60);
    expect(await cacheGet("key")).toEqual({ value: 1 });
    expect(redis.createRedisRateLimiter).not.toHaveBeenCalled();
    expect(redis.createRedisCache).not.toHaveBeenCalled();
  });

  it("uses Redis once REDIS_URL is set, choosing the backend on first use", async () => {
    vi.stubEnv("REDIS_URL", "");
    const { cacheGet, createRateLimiter } = await loadFreshModule();
    const limiter = createRateLimiter(2, 60);
    vi.stubEnv("REDIS_URL", "redis://localhost:6379");

    await limiter.limit("client");
    expect(redis.createRedisRateLimiter).toHaveBeenCalledWith("redis://localhost:6379", {
      requests: 2,
      windowSeconds: 60,
    });
    expect(await cacheGet("key")).toBe("cached");
  });

  it("rejects a REDIS_URL that is not a Redis URL", async () => {
    vi.stubEnv("REDIS_URL", "https://example.com");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { createRateLimiter } = await loadFreshModule();
    expect(() => createRateLimiter().limit("client")).toThrow(
      "Cache environment validation failed",
    );
  });
});

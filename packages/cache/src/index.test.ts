import { beforeEach, describe, expect, it, vi } from "vitest";

const redisClient = {
  isReady: false,
  on: vi.fn(),
  connect: vi.fn(async () => {
    redisClient.isReady = true;
    return redisClient;
  }),
  eval: vi.fn(),
};

vi.mock("redis", () => ({ createClient: vi.fn(() => redisClient) }));

const { createClient } = await import("redis");
const { createRateLimiter } = await import("./index");

describe("createRateLimiter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisClient.isReady = false;
  });

  it("uses process memory when no Redis URL is configured", async () => {
    const limiter = createRateLimiter({ requests: 1, windowSeconds: 60 });

    expect((await limiter.limit("client")).success).toBe(true);
    expect((await limiter.limit("client")).success).toBe(false);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("counts in Redis when a URL is configured", async () => {
    redisClient.eval.mockResolvedValueOnce([3, 30_000]);
    const limiter = createRateLimiter({
      requests: 2,
      windowSeconds: 60,
      redisUrl: "redis://localhost:6379",
    });

    const result = await limiter.limit("client");

    expect(redisClient.eval).toHaveBeenCalledWith(expect.any(String), {
      keys: ["clubedge:rate-limit:client"],
      arguments: ["60000"],
    });
    expect(result).toMatchObject({ success: false, limit: 2, remaining: 0 });
  });

  it("reuses one connection per Redis URL", async () => {
    redisClient.eval.mockResolvedValue([1, 60_000]);
    const url = "redis://reuse.example:6379";
    const first = createRateLimiter({ redisUrl: url });
    const second = createRateLimiter({ redisUrl: url });

    await first.limit("a");
    await second.limit("b");

    expect(createClient).toHaveBeenCalledTimes(1);
    expect(redisClient.connect).toHaveBeenCalledTimes(1);
  });

  it("rejects an unexpected Redis response", async () => {
    redisClient.eval.mockResolvedValueOnce("nope");
    const limiter = createRateLimiter({ redisUrl: "redis://bad.example:6379" });
    await expect(limiter.limit("client")).rejects.toThrow("invalid rate limit response");
  });
});

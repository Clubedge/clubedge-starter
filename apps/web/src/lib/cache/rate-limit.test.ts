import { describe, expect, it } from "vitest";
import { createMemoryRateLimiter } from "./rate-limit";

describe("createMemoryRateLimiter", () => {
  it("allows requests up to the limit and then blocks", async () => {
    const limiter = createMemoryRateLimiter({ requests: 2, windowSeconds: 60 }, { now: () => 0 });

    expect(await limiter.limit("client")).toMatchObject({ success: true, remaining: 1 });
    expect(await limiter.limit("client")).toMatchObject({ success: true, remaining: 0 });
    expect(await limiter.limit("client")).toMatchObject({ success: false, remaining: 0 });
  });

  it("tracks identifiers independently", async () => {
    const limiter = createMemoryRateLimiter({ requests: 1, windowSeconds: 60 }, { now: () => 0 });

    expect((await limiter.limit("a")).success).toBe(true);
    expect((await limiter.limit("b")).success).toBe(true);
    expect((await limiter.limit("a")).success).toBe(false);
  });

  it("starts a new window after the previous one expires", async () => {
    let time = 0;
    const limiter = createMemoryRateLimiter(
      { requests: 1, windowSeconds: 10 },
      { now: () => time },
    );

    expect((await limiter.limit("client")).success).toBe(true);
    expect((await limiter.limit("client")).success).toBe(false);
    time = 10_000;
    expect(await limiter.limit("client")).toMatchObject({ success: true, resetAt: 20_000 });
  });

  it("never holds more than maxKeys windows", async () => {
    const limiter = createMemoryRateLimiter(
      { requests: 1, windowSeconds: 60 },
      { maxKeys: 2, now: () => 0 },
    );

    await limiter.limit("a");
    await limiter.limit("b");
    await limiter.limit("c");
    // "a" was evicted to make room, so it gets a fresh window.
    expect((await limiter.limit("a")).success).toBe(true);
  });

  it("rejects invalid options and identifiers", async () => {
    expect(() => createMemoryRateLimiter({ requests: 0 })).toThrow();
    expect(() => createMemoryRateLimiter({ windowSeconds: 1.5 })).toThrow();
    await expect(createMemoryRateLimiter().limit("")).rejects.toThrow();
  });
});

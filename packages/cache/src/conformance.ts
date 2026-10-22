// The behaviour every Cache and RateLimiter must have, as one test suite. A provider's tests call
// describeCache and describeRateLimiter with factories, so the in-memory reference and the Redis
// provider are held to the same contract and can't drift apart on expiry, copies, or window
// resets between development and production:
//
//   describeCache("redis", () => createRedisCache(url));
//   describeRateLimiter("redis", (options) => createRedisRateLimiter(url, options));
//
// It runs in Vitest, which is why it is a separate entry (`@clubedge/cache/conformance`) that
// only tests import. The contract both providers guarantee is JSON-safe values and whole-second
// TTLs; anything beyond that is a provider's own extension, not shared behaviour.
import { describe, expect, it } from "vitest";
import type { Cache, RateLimitOptions, RateLimiter } from "./index";

export interface ConformanceOptions {
  /** Skip the whole suite, for example when the provider's server isn't available. */
  skip?: boolean | string;
  /** Per-test timeout in milliseconds, for providers behind a network round trip. Default 30s. */
  timeoutMs?: number;
}

/** Unique names, so providers that keep state between tests (a shared Redis) never mix them up. */
let counter = 0;
const unique = (name: string) => `${name}-${Date.now().toString(36)}-${counter++}`;

const after = (seconds: number) => new Promise((resolve) => setTimeout(resolve, seconds * 1_000));

export function describeCache(
  provider: string,
  create: () => Cache | Promise<Cache>,
  options: ConformanceOptions = {},
) {
  const timeout = options.timeoutMs ?? 30_000;
  const suite = options.skip ? describe.skip : describe;

  suite(`Cache conformance: ${provider}`, () => {
    it(
      "roundtrips a value, and answers null for a key it never held",
      async () => {
        const cache = await create();
        const key = unique("greeting");
        expect(await cache.get(key)).toBeNull();

        await cache.set(key, { hello: "world" }, 60);
        expect(await cache.get(key)).toEqual({ hello: "world" });
      },
      timeout,
    );

    it(
      "keeps a value only as long as its TTL",
      async () => {
        const cache = await create();
        const key = unique("gone");
        await cache.set(key, "soon", 1);
        expect(await cache.get(key)).toBe("soon");

        await after(1.1);
        expect(await cache.get(key)).toBeNull();
      },
      timeout,
    );

    it(
      "overwrites a key with the newest value",
      async () => {
        const cache = await create();
        const key = unique("versioned");
        await cache.set(key, { version: 1 }, 60);
        await cache.set(key, { version: 2 }, 60);
        expect(await cache.get(key)).toEqual({ version: 2 });
      },
      timeout,
    );

    it(
      "keeps values as copies from set time",
      async () => {
        const cache = await create();
        const key = unique("snapshot");
        const value = { nested: { count: 1 } };
        await cache.set(key, value, 60);
        value.nested.count = 2;
        expect(await cache.get(key)).toEqual({ nested: { count: 1 } });
      },
      timeout,
    );

    it(
      "refuses a TTL of zero or less",
      async () => {
        const cache = await create();
        await expect(cache.set(unique("zero"), 1, 0)).rejects.toThrow();
        await expect(cache.set(unique("negative"), 1, -5)).rejects.toThrow();
      },
      timeout,
    );
  });
}

export function describeRateLimiter(
  provider: string,
  create: (options: RateLimitOptions) => RateLimiter | Promise<RateLimiter>,
  options: ConformanceOptions = {},
) {
  const timeout = options.timeoutMs ?? 30_000;
  const suite = options.skip ? describe.skip : describe;

  suite(`RateLimiter conformance: ${provider}`, () => {
    it(
      "allows the configured requests, then refuses with nothing remaining",
      async () => {
        const limiter = await create({ requests: 2, windowSeconds: 60 });
        const id = unique("client");
        expect(await limiter.limit(id)).toMatchObject({ success: true, limit: 2, remaining: 1 });

        const last = await limiter.limit(id);
        expect(last).toMatchObject({ success: true, limit: 2, remaining: 0 });
        expect(last.resetAt).toBeGreaterThan(Date.now());

        expect(await limiter.limit(id)).toMatchObject({ success: false, limit: 2, remaining: 0 });
      },
      timeout,
    );

    it(
      "counts identifiers separately",
      async () => {
        const limiter = await create({ requests: 1, windowSeconds: 60 });
        expect((await limiter.limit(unique("first"))).success).toBe(true);
        expect((await limiter.limit(unique("second"))).success).toBe(true);
      },
      timeout,
    );

    it(
      "admits the identifier again once its window has passed",
      async () => {
        const limiter = await create({ requests: 1, windowSeconds: 1 });
        const id = unique("burst");
        expect((await limiter.limit(id)).success).toBe(true);
        expect((await limiter.limit(id)).success).toBe(false);

        await after(1.1);
        expect((await limiter.limit(id)).success).toBe(true);
      },
      timeout,
    );

    it(
      "refuses invalid options and identifiers",
      async () => {
        await expect(Promise.resolve().then(() => create({ requests: 0 }))).rejects.toThrow();
        await expect(Promise.resolve().then(() => create({ windowSeconds: 0 }))).rejects.toThrow();

        const limiter = await create({ requests: 1 });
        await expect(limiter.limit("")).rejects.toThrow();
        await expect(limiter.limit("x".repeat(257))).rejects.toThrow();
      },
      timeout,
    );
  });
}

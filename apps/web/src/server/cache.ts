import "server-only";
import { z } from "zod";
import {
  createMemoryCache,
  createMemoryRateLimiter,
  type Cache,
  type RateLimiter,
} from "@clubedge/cache";
import { createRedisCache, createRedisRateLimiter } from "@clubedge/cache-redis";
import { optional, parseEnv } from "@/env/server";

export type { Cache, RateLimiter, RateLimitResult } from "@clubedge/cache";

const cacheEnvSchema = z.object({
  REDIS_URL: optional(z.url({ protocol: /^rediss?$/ })),
});

function getRedisUrl(): string | undefined {
  return parseEnv(cacheEnvSchema, "Cache").REDIS_URL || undefined;
}

/**
 * Uses Redis when REDIS_URL is configured, otherwise a per-process memory limiter. The
 * backend is chosen on first use so module-level limiters do not read env at import time.
 */
export function createRateLimiter(requests = 10, windowSeconds = 60): RateLimiter {
  let limiter: RateLimiter | undefined;
  return {
    limit(identifier) {
      if (!limiter) {
        const url = getRedisUrl();
        limiter = url
          ? createRedisRateLimiter(url, { requests, windowSeconds })
          : createMemoryRateLimiter({ requests, windowSeconds });
      }
      return limiter.limit(identifier);
    },
  };
}

let cache: Cache | undefined;

/** Redis when REDIS_URL is configured, otherwise per-process memory. Resolved on first use. */
function resolveCache(): Cache {
  if (!cache) {
    const url = getRedisUrl();
    cache = url ? createRedisCache(url) : createMemoryCache();
  }
  return cache;
}

export function cacheGet<T>(key: string): Promise<T | null> {
  return resolveCache().get<T>(key);
}

export function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  return resolveCache().set(key, value, ttlSeconds);
}

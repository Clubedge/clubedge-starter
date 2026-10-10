import "@tanstack/react-start/server-only";
import {
  createRateLimiter as createLimiter,
  createRedisCache,
  type RateLimiter,
} from "@clubedge/cache";
import { getRedisUrl } from "@/env/server";

export type { RateLimiter, RateLimitResult } from "@clubedge/cache";

/**
 * Uses Redis when REDIS_URL is configured, otherwise a per-process memory limiter. The
 * backend is chosen on first use so module-level limiters do not read env at import time.
 */
export function createRateLimiter(requests = 10, windowSeconds = 60): RateLimiter {
  let limiter: RateLimiter | undefined;
  return {
    limit(identifier) {
      limiter ??= createLimiter({
        requests,
        windowSeconds,
        redisUrl: getRedisUrl(),
      });
      return limiter.limit(identifier);
    },
  };
}

/** Cache reads miss and writes are skipped while Redis is not configured. */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const url = getRedisUrl();
  return url ? createRedisCache(url).get<T>(key) : null;
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const url = getRedisUrl();
  if (url) await createRedisCache(url).set(key, value, ttlSeconds);
}

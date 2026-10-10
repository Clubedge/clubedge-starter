import "@tanstack/react-start/server-only";
import {
  createMemoryCache,
  createMemoryRateLimiter,
  type Cache,
  type RateLimiter,
} from "@clubedge/cache";

export type { Cache, RateLimiter, RateLimitResult } from "@clubedge/cache";

// Rate limits and cached values live in process memory, which suits a single server instance.
// Projects that run several instances should use the Redis module instead.

export function createRateLimiter(requests = 10, windowSeconds = 60): RateLimiter {
  return createMemoryRateLimiter({ requests, windowSeconds });
}

const cache: Cache = createMemoryCache();

export function cacheGet<T>(key: string): Promise<T | null> {
  return cache.get<T>(key);
}

export function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  return cache.set(key, value, ttlSeconds);
}

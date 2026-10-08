import "server-only";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { env, hasRedisConfig } from "@/env/server";

export const redis = hasRedisConfig()
  ? new Redis({ url: env.UPSTASH_REDIS_REST_URL!, token: env.UPSTASH_REDIS_REST_TOKEN! })
  : null;

export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!redis) return null;
  return redis.get<T>(key);
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  if (!redis) return;
  await redis.set(key, value, { ex: ttlSeconds });
}

/** Null Redis config deliberately means unconfigured, never silently fail-open. */
export function createRateLimiter(requests = 10, window: "60 s" | "1 m" = "1 m") {
  if (!redis) return null;
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(requests, window),
    analytics: true,
  });
}

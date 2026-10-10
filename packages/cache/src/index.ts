import { createMemoryRateLimiter, type RateLimiter, type RateLimitOptions } from "./rate-limit";
import { createRedisRateLimiter } from "./redis";

export {
  createMemoryRateLimiter,
  type RateLimiter,
  type RateLimitOptions,
  type RateLimitResult,
} from "./rate-limit";
export { createRedisCache, createRedisRateLimiter, type Cache } from "./redis";

/**
 * Uses Redis when a URL is provided so limits are shared across instances. Without one it
 * falls back to a per-process memory limiter, which suits a single server only.
 */
export function createRateLimiter(options: RateLimitOptions & { redisUrl?: string }): RateLimiter {
  const { redisUrl, ...limits } = options;
  return redisUrl ? createRedisRateLimiter(redisUrl, limits) : createMemoryRateLimiter(limits);
}

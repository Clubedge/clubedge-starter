import "server-only";
import { createClient } from "redis";
import { getServerEnv, hasRedisConfig } from "@/env/server";

import {
  createMemoryRateLimiter,
  validateRateLimitIdentifier,
  validateRateLimitOptions,
  type RateLimiter,
} from "./rate-limit";

export type { RateLimiter, RateLimitResult } from "./rate-limit";

type RedisClient = ReturnType<typeof createClient>;

const globalForRedis = globalThis as typeof globalThis & {
  clubedgeRedisClient?: RedisClient;
  clubedgeRedisConnection?: Promise<RedisClient>;
};

function getRedisClient(): RedisClient | null {
  if (!hasRedisConfig()) return null;
  if (globalForRedis.clubedgeRedisClient) return globalForRedis.clubedgeRedisClient;

  const client = createClient({
    url: getServerEnv().REDIS_URL!,
    socket: {
      connectTimeout: 5_000,
      reconnectStrategy: (retries) => Math.min(retries * 250, 3_000),
    },
  });
  client.on("error", (error) => console.error("Redis client error", error));
  globalForRedis.clubedgeRedisClient = client;
  return client;
}

async function connectRedis(): Promise<RedisClient | null> {
  const client = getRedisClient();
  if (!client) return null;
  if (client.isReady) return client;

  globalForRedis.clubedgeRedisConnection ??= client.connect().catch((error: unknown) => {
    globalForRedis.clubedgeRedisConnection = undefined;
    throw error;
  });
  return globalForRedis.clubedgeRedisConnection;
}

function cacheKey(key: string) {
  return `clubedge:cache:${key}`;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const client = await connectRedis();
  if (!client) return null;

  const value = await client.get(cacheKey(key));
  if (value === null) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return value as T;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1) {
    throw new Error("Cache TTL must be a positive integer number of seconds.");
  }

  const client = await connectRedis();
  if (!client) return;
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error("Cache values must be JSON serializable.");
  }
  await client.set(cacheKey(key), serialized, { EX: ttlSeconds });
}

/**
 * Uses Redis when REDIS_URL is configured so limits are shared across instances. Without
 * Redis it falls back to a per-process memory limiter, which suits a single server only.
 */
export function createRateLimiter(requests = 10, windowSeconds = 60): RateLimiter {
  validateRateLimitOptions({ requests, windowSeconds });
  // Chosen on first use so module-level limiters do not read the environment at import.
  let memoryLimiter: RateLimiter | undefined;

  return {
    async limit(identifier) {
      if (!hasRedisConfig()) {
        memoryLimiter ??= createMemoryRateLimiter({ requests, windowSeconds });
        return memoryLimiter.limit(identifier);
      }

      validateRateLimitIdentifier(identifier);
      const client = await connectRedis();
      if (!client) throw new Error("REDIS_URL is not configured.");

      const key = `clubedge:rate-limit:${identifier}`;
      const result = await client.eval(
        `local count = redis.call('INCR', KEYS[1])
         if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
         return { count, redis.call('PTTL', KEYS[1]) }`,
        { keys: [key], arguments: [String(windowSeconds * 1_000)] },
      );
      if (!Array.isArray(result) || result.length !== 2) {
        throw new Error("Redis returned an invalid rate limit response.");
      }

      const count = Number(result[0]);
      const ttlMilliseconds = Number(result[1]);
      return {
        success: count <= requests,
        limit: requests,
        remaining: Math.max(0, requests - count),
        resetAt: Date.now() + Math.max(0, ttlMilliseconds),
      };
    },
  };
}

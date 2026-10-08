import "server-only";
import { createClient } from "redis";
import { env, hasRedisConfig } from "@/env/server";

type RedisClient = ReturnType<typeof createClient>;
type RedisResult = {
  success: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
};

type RedisRateLimiter = {
  limit(identifier: string): Promise<RedisResult>;
};

const globalForRedis = globalThis as typeof globalThis & {
  clubedgeRedisClient?: RedisClient;
  clubedgeRedisConnection?: Promise<RedisClient>;
};

function getRedisClient(): RedisClient | null {
  if (!hasRedisConfig()) return null;
  if (globalForRedis.clubedgeRedisClient) return globalForRedis.clubedgeRedisClient;

  const client = createClient({
    url: env.REDIS_URL!,
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

/** Null config means unconfigured. Callers can choose an explicit local policy. */
export function createRateLimiter(requests = 10, windowSeconds = 60): RedisRateLimiter | null {
  if (!hasRedisConfig()) return null;
  if (!Number.isInteger(requests) || requests < 1) {
    throw new Error("Rate limit must allow at least one request.");
  }
  if (!Number.isInteger(windowSeconds) || windowSeconds < 1) {
    throw new Error("Rate limit window must be a positive number of seconds.");
  }

  return {
    async limit(identifier) {
      if (identifier.length < 1 || identifier.length > 256) {
        throw new Error("Rate limit identifier must contain between 1 and 256 characters.");
      }
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

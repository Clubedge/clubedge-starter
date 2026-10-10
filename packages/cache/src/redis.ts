import { createClient } from "redis";
import {
  validateRateLimitIdentifier,
  validateRateLimitOptions,
  type RateLimiter,
  type RateLimitOptions,
} from "./rate-limit";

type RedisClient = ReturnType<typeof createClient>;

// One client per URL for the life of the process, surviving dev-server module reloads.
const globalForRedis = globalThis as typeof globalThis & {
  clubedgeRedis?: Map<string, { client: RedisClient; connection?: Promise<RedisClient> }>;
};

function redisEntry(url: string) {
  globalForRedis.clubedgeRedis ??= new Map();
  let entry = globalForRedis.clubedgeRedis.get(url);
  if (!entry) {
    const client = createClient({
      url,
      socket: {
        connectTimeout: 5_000,
        reconnectStrategy: (retries) => Math.min(retries * 250, 3_000),
      },
    });
    client.on("error", (error) => console.error("Redis client error", error));
    entry = { client };
    globalForRedis.clubedgeRedis.set(url, entry);
  }
  return entry;
}

export async function connectRedis(url: string): Promise<RedisClient> {
  const entry = redisEntry(url);
  if (entry.client.isReady) return entry.client;

  entry.connection ??= entry.client.connect().catch((error: unknown) => {
    entry.connection = undefined;
    throw error;
  });
  return entry.connection;
}

export interface Cache {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
}

export function createRedisCache(url: string, prefix = "clubedge:cache:"): Cache {
  return {
    async get<T>(key: string) {
      const value = await (await connectRedis(url)).get(`${prefix}${key}`);
      if (value === null) return null;
      try {
        return JSON.parse(value) as T;
      } catch {
        return value as T;
      }
    },
    async set(key, value, ttlSeconds) {
      if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1) {
        throw new Error("Cache TTL must be a positive integer number of seconds.");
      }
      const serialized = JSON.stringify(value);
      if (serialized === undefined) {
        throw new Error("Cache values must be JSON serializable.");
      }
      await (await connectRedis(url)).set(`${prefix}${key}`, serialized, { EX: ttlSeconds });
    },
  };
}

/** Fixed-window limiter shared by every instance that uses the same Redis database. */
export function createRedisRateLimiter(
  url: string,
  options: RateLimitOptions = {},
  prefix = "clubedge:rate-limit:",
): RateLimiter {
  const { requests, windowSeconds } = validateRateLimitOptions(options);

  return {
    async limit(identifier) {
      validateRateLimitIdentifier(identifier);
      const client = await connectRedis(url);
      const result = await client.eval(
        `local count = redis.call('INCR', KEYS[1])
         if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
         return { count, redis.call('PTTL', KEYS[1]) }`,
        { keys: [`${prefix}${identifier}`], arguments: [String(windowSeconds * 1_000)] },
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

// Rate limits for routes anyone can call, per client address. The limiters come from
// src/server/cache (Redis or process memory); tests and routes without one use memory.
import type { MiddlewareHandler } from "hono";
import { createMemoryRateLimiter, type RateLimiter } from "@clubedge/cache";
import { getClientIp, reportError } from "@clubedge/core";
import { apiError } from "@/http";

/** Makes a limiter allowing `requests` per `windowSeconds`, as src/server/cache does. */
export type CreateRateLimiter = (requests: number, windowSeconds: number) => RateLimiter;

/** Limits held in this process: for tests, and for an API without a shared cache. */
export const createMemoryLimiter: CreateRateLimiter = (requests, windowSeconds) =>
  createMemoryRateLimiter({ requests, windowSeconds });

export interface RateLimitOptions {
  /** Names the limit, so routes sharing a limiter backend count separately. */
  scope: string;
  /**
   * What to do when the limiter's backend (Redis) fails: let the request through (true, the
   * default), so an outage locks nobody out, or refuse it with 503.
   */
  failOpen?: boolean;
}

/**
 * Answers 429 rate_limited, with Retry-After in seconds, once a client address has used up its
 * requests for the window.
 */
export function rateLimit(
  limiter: RateLimiter,
  { scope, failOpen = true }: RateLimitOptions,
): MiddlewareHandler {
  return async (c, next) => {
    let result;
    try {
      result = await limiter.limit(`${scope}:${getClientIp(c.req.raw.headers)}`);
    } catch (error) {
      reportError(error, { message: "Rate limiter unavailable" });
      if (!failOpen) {
        return apiError(c, 503, "unavailable", "Try again in a moment.");
      }
      return next();
    }
    if (!result.success) {
      const seconds = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1_000));
      c.header("Retry-After", String(seconds));
      return apiError(c, 429, "rate_limited", "Too many requests. Try again later.");
    }
    await next();
  };
}

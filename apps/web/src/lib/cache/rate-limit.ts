export type RateLimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
};

export type RateLimiter = {
  limit(identifier: string): Promise<RateLimitResult>;
};

export type RateLimitOptions = {
  requests?: number;
  windowSeconds?: number;
};

export function validateRateLimitOptions({ requests = 10, windowSeconds = 60 }: RateLimitOptions) {
  if (!Number.isInteger(requests) || requests < 1) {
    throw new Error("Rate limit must allow at least one request.");
  }
  if (!Number.isInteger(windowSeconds) || windowSeconds < 1) {
    throw new Error("Rate limit window must be a positive number of seconds.");
  }
  return { requests, windowSeconds };
}

export function validateRateLimitIdentifier(identifier: string) {
  if (identifier.length < 1 || identifier.length > 256) {
    throw new Error("Rate limit identifier must contain between 1 and 256 characters.");
  }
}

/**
 * Fixed-window limiter held in process memory. Limits apply per server instance, so use
 * Redis when the app runs on several instances or serverless functions.
 */
export function createMemoryRateLimiter(
  options: RateLimitOptions = {},
  { maxKeys = 10_000, now = Date.now }: { maxKeys?: number; now?: () => number } = {},
): RateLimiter {
  const { requests, windowSeconds } = validateRateLimitOptions(options);
  const windowMilliseconds = windowSeconds * 1_000;
  const windows = new Map<string, { count: number; resetAt: number }>();

  function evictExpired(currentTime: number) {
    for (const [key, window] of windows) {
      if (window.resetAt <= currentTime) windows.delete(key);
    }
  }

  return {
    async limit(identifier) {
      validateRateLimitIdentifier(identifier);
      const currentTime = now();
      let window = windows.get(identifier);

      if (!window || window.resetAt <= currentTime) {
        if (windows.size >= maxKeys) evictExpired(currentTime);
        // Still full: drop the oldest entry rather than grow without bound.
        if (windows.size >= maxKeys) windows.delete(windows.keys().next().value!);
        window = { count: 0, resetAt: currentTime + windowMilliseconds };
        windows.set(identifier, window);
      }

      window.count += 1;
      return {
        success: window.count <= requests,
        limit: requests,
        remaining: Math.max(0, requests - window.count),
        resetAt: window.resetAt,
      };
    },
  };
}

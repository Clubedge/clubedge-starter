/** A key-value cache with per-entry expiry. Adapters: in-memory here, Redis in @clubedge/cache-redis. */
export interface Cache {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
}

/**
 * Cache held in process memory. Entries are per server instance and vanish on restart, so use
 * Redis when the app runs on several instances. The oldest entry is evicted past `maxKeys`.
 */
export function createMemoryCache({
  maxKeys = 10_000,
  now = Date.now,
}: { maxKeys?: number; now?: () => number } = {}): Cache {
  const entries = new Map<string, { value: unknown; expiresAt: number }>();

  return {
    async get<T>(key: string) {
      const entry = entries.get(key);
      if (!entry) return null;
      if (entry.expiresAt <= now()) {
        entries.delete(key);
        return null;
      }
      return entry.value as T;
    },
    async set(key, value, ttlSeconds) {
      if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
        throw new Error("Cache TTL must be a positive number of seconds.");
      }
      entries.delete(key);
      if (entries.size >= maxKeys) entries.delete(entries.keys().next().value!);
      // Store a structured copy so later mutations of `value` do not change the cache.
      entries.set(key, { value: structuredClone(value), expiresAt: now() + ttlSeconds * 1000 });
    },
  };
}

// Hosted PostgreSQL often comes with two URLs: a pooled one (PgBouncer in transaction mode) for the
// app's many short requests, and a direct one for work that needs a whole session to itself.

type Env = Record<string, string | undefined>;

/**
 * The URL for migrations and other long-lived sessions: DATABASE_URL_DIRECT when it is set,
 * else DATABASE_URL. Transaction poolers can break DDL in migrations and session state.
 */
export function directDatabaseUrl(env: Env): string | undefined {
  return env.DATABASE_URL_DIRECT?.trim() || env.DATABASE_URL?.trim() || undefined;
}

/** The host of a connection URL, or null for a value that isn't one. */
function hostOf(url: string): string | null {
  try {
    return new URL(url.trim()).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Whether a URL points at Neon (*.neon.tech). */
export function isNeonUrl(url: string): boolean {
  return hostOf(url)?.endsWith(".neon.tech") ?? false;
}

/** Whether a URL points at Neon's connection pooler: its compute's host with -pooler added. */
export function isNeonPooledUrl(url: string): boolean {
  const host = hostOf(url);
  return Boolean(host?.endsWith(".neon.tech") && /^[^.]+-pooler\./.test(host));
}

import postgres from "postgres";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

export interface DatabaseConfig {
  url: string;
  /** Pool size. Keep it small for serverless and transaction poolers. */
  maxConnections?: number;
}

export function createDb({ url, maxConnections = 1 }: DatabaseConfig) {
  const client = postgres(url, {
    // Required for Supabase transaction pooling and other PgBouncer-style poolers.
    prepare: false,
    max: maxConnections,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  return drizzle({ client, schema });
}

export type Database = ReturnType<typeof createDb>;

/**
 * Resolves true when the database answers a trivial query within `timeoutMs`, for readiness
 * checks: a database that hangs counts as not ready rather than holding the request open.
 */
export async function isDatabaseReady(db: Database, timeoutMs = 2_000): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  try {
    return await Promise.race([db.execute(sql`select 1`).then(() => true), timeout]);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

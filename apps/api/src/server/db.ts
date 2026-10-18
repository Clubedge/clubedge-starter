import { createDb, isDatabaseReady, type Database } from "@clubedge/db";
import { getServerEnv } from "@/env";

const globalForDb = globalThis as typeof globalThis & { clubedgeDb?: Database };

/** Creates the connection pool on first use and reuses it across dev restarts in one process. */
export function getDb(): Database {
  if (globalForDb.clubedgeDb) return globalForDb.clubedgeDb;
  const env = getServerEnv();
  globalForDb.clubedgeDb = createDb({
    url: env.DATABASE_URL,
    maxConnections: env.NODE_ENV === "production" ? 10 : 1,
  });
  return globalForDb.clubedgeDb;
}

/** Ready when the database answers; a missing or invalid configuration is not ready either. */
export async function isReady(): Promise<boolean> {
  try {
    return await isDatabaseReady(getDb());
  } catch {
    return false;
  }
}

import "server-only";
import { createDb, type Database } from "@clubedge/db";
import { getServerEnv } from "@/env/server";

const globalForDb = globalThis as typeof globalThis & { clubedgeDb?: Database };

/** Creates the connection pool on first use and reuses it across dev hot reloads. */
export function getDb(): Database {
  if (globalForDb.clubedgeDb) return globalForDb.clubedgeDb;
  const env = getServerEnv();
  globalForDb.clubedgeDb = createDb({
    url: env.DATABASE_URL,
    maxConnections: env.NODE_ENV === "production" ? 10 : 1,
  });
  return globalForDb.clubedgeDb;
}

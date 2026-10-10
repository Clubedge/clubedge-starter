import "server-only";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";
import { getServerEnv } from "@/env/server";

type Database = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as {
  postgresClient?: ReturnType<typeof postgres>;
  drizzleDb?: Database;
};

/** Creates the connection pool on first use; reuses it across dev hot reloads. */
export function getDb(): Database {
  if (globalForDb.drizzleDb) return globalForDb.drizzleDb;

  const env = getServerEnv();
  const client =
    globalForDb.postgresClient ??
    postgres(env.DATABASE_URL, {
      prepare: false,
      max: env.NODE_ENV === "production" ? 10 : 1,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  globalForDb.postgresClient = client;
  globalForDb.drizzleDb = drizzle({ client, schema });
  return globalForDb.drizzleDb;
}

export { schema };

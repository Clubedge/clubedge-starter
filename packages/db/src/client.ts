import postgres from "postgres";
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

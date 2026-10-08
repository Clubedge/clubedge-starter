import "server-only";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";
import { env } from "@/env/server";

const globalForDb = globalThis as unknown as { postgresClient?: ReturnType<typeof postgres> };

const client =
  globalForDb.postgresClient ??
  postgres(env.DATABASE_URL, {
    prepare: false,
    max: env.NODE_ENV === "production" ? 10 : 1,
    idle_timeout: 20,
    connect_timeout: 10,
  });

if (env.NODE_ENV !== "production") globalForDb.postgresClient = client;

export const db = drizzle({ client, schema });
export { schema };

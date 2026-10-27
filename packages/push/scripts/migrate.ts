import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "@clubedge/db";
import { requireDirectDatabaseUrl } from "@clubedge/db/load-env";

const db = createDb({ url: requireDirectDatabaseUrl("run push notification migrations") });
try {
  await migrate(db, {
    migrationsFolder: "./drizzle",
    migrationsTable: "__drizzle_migrations_push",
  });
  console.info("Push notification migrations applied.");
} finally {
  await db.$client.end();
}

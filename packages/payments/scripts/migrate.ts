import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "@clubedge/db";
import { requireDatabaseUrl } from "@clubedge/db/load-env";

const db = createDb({ url: requireDatabaseUrl("run payment migrations") });
try {
  await migrate(db, {
    migrationsFolder: "./drizzle",
    migrationsTable: "__drizzle_migrations_payments",
  });
  console.info("Payment migrations applied.");
} finally {
  await db.$client.end();
}

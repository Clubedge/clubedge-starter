import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "@clubedge/db";
import { requireDirectDatabaseUrl } from "@clubedge/db/load-env";

const db = createDb({ url: requireDirectDatabaseUrl("run Better Auth migrations") });
try {
  await migrate(db, {
    migrationsFolder: "./drizzle",
    migrationsTable: "__drizzle_migrations_better_auth",
  });
  console.info("Better Auth migrations applied.");
} finally {
  await db.$client.end();
}

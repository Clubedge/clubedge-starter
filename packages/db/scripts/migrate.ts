import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "../src/client";
import { requireDatabaseUrl } from "./load-env";

const db = createDb({ url: requireDatabaseUrl("run migrations") });
try {
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.info("Database migrations applied.");
} finally {
  await db.$client.end();
}

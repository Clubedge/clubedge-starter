import { defineConfig } from "drizzle-kit";
import { requireDirectDatabaseUrl } from "@clubedge/db/load-env";

// Push notifications keep their own migration history, separate from the app's tables in
// @clubedge/db, so projects without this module have no push tables or migrations.
export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  migrations: { table: "__drizzle_migrations_push" },
  dbCredentials: { url: requireDirectDatabaseUrl("run drizzle-kit") },
});

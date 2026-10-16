import { defineConfig } from "drizzle-kit";
import { requireDirectDatabaseUrl } from "./scripts/load-env";

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: requireDirectDatabaseUrl("run drizzle-kit") },
});

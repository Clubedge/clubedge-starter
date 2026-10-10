import { defineConfig } from "drizzle-kit";
import { requireDatabaseUrl } from "./scripts/load-env";

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: requireDatabaseUrl("run drizzle-kit") },
});

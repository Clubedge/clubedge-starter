import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";
import { z } from "zod";

config({ path: ".env.local" });
config();

const databaseUrl = z.url().parse(process.env.DATABASE_URL);

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: databaseUrl },
});

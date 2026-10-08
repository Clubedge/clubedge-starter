import { config } from "dotenv";
config({ path: ".env.local" });
config();
import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required to run migrations.");
const client = postgres(url, { prepare: false, max: 1 });
try {
  await migrate(drizzle({ client }), { migrationsFolder: "./drizzle" });
  console.info("Database migrations applied.");
} finally {
  await client.end();
}

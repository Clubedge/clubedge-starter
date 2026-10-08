import { config } from "dotenv";
config({ path: ".env.local" });
config();
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { users } from "../src/db/schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required to seed the database.");
const client = postgres(url, { prepare: false, max: 1 });
try {
  const db = drizzle({ client });
  await db
    .insert(users)
    .values({ email: "hello@example.com", displayName: "Starter User" })
    .onConflictDoNothing();
  console.info("Seed complete.");
} finally {
  await client.end();
}

// Applies every package's database migrations in production: `node /app/migrate.mjs` in the image.
// scripts/build-migrator.mjs bundles this file with its dependencies and copies each package's
// migrations next to it, so it runs without the workspace. Development uses `pnpm db:migrate`.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

// The direct URL when there is one: a transaction pooler (Neon's -pooler host, Supabase's port
// 6543) can break DDL, so migrations use a whole session.
const url = process.env.DATABASE_URL_DIRECT?.trim() || process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("DATABASE_URL (or DATABASE_URL_DIRECT) is required to run migrations.");
  process.exit(1);
}

const directory = join(import.meta.dirname, "migrations");
/** @type {Array<{ name: string; table: string }>} */
const sets = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8"));

// Prepared statements off, as packages/db configures postgres.js, for transaction poolers.
const client = postgres(url, { max: 1, prepare: false });
try {
  const db = drizzle({ client });
  for (const { name, table } of sets) {
    await migrate(db, { migrationsFolder: join(directory, name), migrationsTable: table });
    console.info(`Applied ${name} migrations.`);
  }
} finally {
  await client.end();
}

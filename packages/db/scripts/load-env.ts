import { config } from "dotenv";
import { resolve } from "node:path";
import { directDatabaseUrl } from "../src/urls";

// Database commands run from packages/db and share the app's environment file, so a project
// has one place for secrets: the web app's, or the API's when a separate API owns the database.
// Variables already set in the shell (or an earlier file) take precedence.
for (const file of ["../../apps/web/.env.local", "../../apps/api/.env.local", ".env.local"]) {
  config({ path: resolve(process.cwd(), file), quiet: true });
}

export function requireDatabaseUrl(purpose: string): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error(`DATABASE_URL is required to ${purpose}.`);
  return url;
}

/**
 * DATABASE_URL_DIRECT when it is set, else DATABASE_URL: migrations and Drizzle Kit need a whole
 * session, which a transaction pooler (Neon's -pooler host, Supabase's port 6543) doesn't give.
 */
export function requireDirectDatabaseUrl(purpose: string): string {
  return directDatabaseUrl(process.env) ?? requireDatabaseUrl(purpose);
}

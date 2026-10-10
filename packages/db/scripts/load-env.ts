import { config } from "dotenv";
import { resolve } from "node:path";

// Database commands run from packages/db and share the app's environment file, so a project
// has one place for secrets. Variables already set in the shell take precedence.
for (const file of ["../../apps/web/.env.local", ".env.local"]) {
  config({ path: resolve(process.cwd(), file), quiet: true });
}

export function requireDatabaseUrl(purpose: string): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error(`DATABASE_URL is required to ${purpose}.`);
  return url;
}

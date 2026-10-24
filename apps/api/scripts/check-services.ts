// Checks every service the API uses with a real round trip: `pnpm check:services`.
// It reads the API's .env.local like the API does, so it confirms the API's own settings.
import { createDb } from "@clubedge/db";
import { isNeonPooledUrl } from "@clubedge/db/urls";

type Check = { name: string; skip?: string; run: () => Promise<string> };

/** Services can take a few seconds to accept connections after `pnpm infra:up`. */
async function withRetry(run: () => Promise<string>, attempts = 15): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }
}

async function main() {
  const env = process.env;

  const checks: Check[] = [
    {
      name: "PostgreSQL",
      skip: env.DATABASE_URL ? undefined : "DATABASE_URL is not set",
      async run() {
        const db = createDb({ url: env.DATABASE_URL! });
        try {
          const [row] = await db.$client`select current_database() as name`;
          // clubedge:if auth=better-auth
          // Better Auth's tables exist once `pnpm db:migrate` has run.
          await db.$client`select 1 from auth_user limit 1`;
          // clubedge:end
          return `connected to database "${row?.name}"`;
        } finally {
          await db.$client.end();
        }
      },
    },
    {
      name: "PostgreSQL, direct",
      skip: env.DATABASE_URL_DIRECT?.trim()
        ? undefined
        : "DATABASE_URL_DIRECT is not set; migrations use DATABASE_URL",
      async run() {
        const url = env.DATABASE_URL_DIRECT!.trim();
        if (isNeonPooledUrl(url))
          throw new Error("it points at Neon's pooler: use the host without -pooler");
        const db = createDb({ url });
        try {
          const [row] = await db.$client`select current_database() as name`;
          return `connected to database "${row?.name}" through DATABASE_URL_DIRECT`;
        } finally {
          await db.$client.end();
        }
      },
    },
  ];

  let failed = false;
  for (const check of checks) {
    if (check.skip) {
      console.log(`-  ${check.name}: skipped (${check.skip})`);
      continue;
    }
    try {
      console.log(`✓  ${check.name}: ${await withRetry(check.run)}`);
    } catch (error) {
      failed = true;
      console.log(`✗  ${check.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (failed) {
    console.error("Check the variables in apps/api/.env.local, then start the services.");
  }
  // Service clients can keep the process alive, so exit explicitly.
  process.exit(failed ? 1 : 0);
}

void main();

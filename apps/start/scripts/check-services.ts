// Checks every service this project uses with a real round trip: `pnpm check:services`.
// It reads the app's .env.local like the app does, so it confirms the app's own settings.
import { existsSync } from "node:fs";
import { createDb } from "@clubedge/db";
// clubedge:if cache=redis
import { createRedisCache } from "@clubedge/cache-redis";
// clubedge:end
// clubedge:if storage=s3
import { createS3Storage } from "@clubedge/storage-s3";
// clubedge:end

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
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
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
    // clubedge:if cache=redis
    {
      name: "Redis",
      skip: env.REDIS_URL ? undefined : "REDIS_URL is not set; the app uses process memory",
      async run() {
        const cache = createRedisCache(env.REDIS_URL!);
        const value = { checkedAt: Date.now() };
        await cache.set("check-services", value, 30);
        const read = await cache.get<typeof value>("check-services");
        if (read?.checkedAt !== value.checkedAt) throw new Error("read back a different value");
        return "wrote and read a cached value";
      },
    },
    // clubedge:end
    // clubedge:if storage=s3
    {
      name: "File storage",
      skip: env.STORAGE_BUCKET ? undefined : "STORAGE_BUCKET is not set",
      async run() {
        const storage = createS3Storage({
          bucket: env.STORAGE_BUCKET,
          region: env.STORAGE_REGION || "auto",
          endpoint: env.STORAGE_ENDPOINT || undefined,
          accessKeyId: env.STORAGE_ACCESS_KEY_ID || undefined,
          secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY || undefined,
        });
        const key = `check-services/${Date.now()}.txt`;
        await storage.upload({
          key,
          body: new TextEncoder().encode("ok"),
          contentType: "text/plain",
        });
        const text = await new Response(await storage.download(key)).text();
        await storage.delete(key);
        if (text !== "ok") throw new Error(`read back "${text}"`);
        return `uploaded, read back, and deleted an object in "${env.STORAGE_BUCKET}"`;
      },
    },
    // clubedge:end
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
  // Redis clients keep the process alive, so exit explicitly.
  process.exit(failed ? 1 : 0);
}

void main();

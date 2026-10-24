// Checks every service the API uses with a real round trip: `pnpm check:services`.
// It reads the API's .env.local like the API does, so it confirms the API's own settings.
import { createDb } from "@clubedge/db";
import { isNeonPooledUrl } from "@clubedge/db/urls";
// clubedge:if cache=redis
import { createRedisCache } from "@clubedge/cache-redis";
// clubedge:end
// clubedge:if storage=s3
import { createS3Storage } from "@clubedge/storage-s3";
// clubedge:end
// clubedge:if storage=s3 && infra=local
import { createFileSystemStorage } from "@clubedge/storage/file-system";
// clubedge:end
// clubedge:if email=smtp
import { createSmtpEmail } from "@clubedge/email-smtp";
// clubedge:end
// clubedge:if email=resend
import { createResendEmail } from "@clubedge/email-resend";
// clubedge:end
// clubedge:if payments=stripe
import { createStripePayments } from "@clubedge/payments-stripe";
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
    // clubedge:if cache=redis
    {
      name: "Redis",
      skip: env.REDIS_URL ? undefined : "REDIS_URL is not set; the API uses process memory",
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
    // clubedge:if storage=s3 && infra=local
    {
      name: "Local folder storage",
      skip: env.STORAGE_DIRECTORY ? undefined : "STORAGE_DIRECTORY is not set",
      async run() {
        const storage = createFileSystemStorage({ directory: env.STORAGE_DIRECTORY! });
        const key = `check-services/${Date.now()}.txt`;
        await storage.upload({
          key,
          body: new TextEncoder().encode("ok"),
          contentType: "text/plain",
        });
        const text = await new Response(await storage.download(key)).text();
        await storage.delete(key);
        if (text !== "ok") throw new Error(`read back "${text}"`);
        return `wrote, read back, and deleted a file in ${env.STORAGE_DIRECTORY}`;
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
    // clubedge:if email=smtp
    {
      name: "Email (SMTP)",
      skip: env.SMTP_URL ? undefined : "SMTP_URL is not set; development prints emails to the log",
      async run() {
        // Connects and authenticates without sending anything.
        const email = createSmtpEmail({
          url: env.SMTP_URL!,
          from: env.EMAIL_FROM || "no-reply@example.com",
        });
        await email.verify();
        return `connected to ${new URL(env.SMTP_URL!).host}`;
      },
    },
    // clubedge:end
    // clubedge:if email=resend
    {
      name: "Email (Resend)",
      skip: env.RESEND_API_KEY
        ? undefined
        : "RESEND_API_KEY is not set; development prints emails to the log",
      async run() {
        // Checks the API key without sending anything.
        const email = createResendEmail({
          apiKey: env.RESEND_API_KEY!,
          from: env.EMAIL_FROM || "no-reply@example.com",
        });
        await email.verify();
        return "API key accepted";
      },
    },
    // clubedge:end
    // clubedge:if payments=stripe
    {
      name: "Payments (Stripe)",
      skip: env.STRIPE_SECRET_KEY ? undefined : "STRIPE_SECRET_KEY is not set",
      async run() {
        // A read-only request that checks the key; nothing is charged or created.
        const stripe = createStripePayments({
          secretKey: env.STRIPE_SECRET_KEY!,
          webhookSecret: env.STRIPE_WEBHOOK_SECRET || "unused",
          prices: {},
          apiBase: env.STRIPE_API_BASE || undefined,
        });
        await stripe.verify();
        return "secret key accepted";
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
  if (failed) {
    console.error("Check the variables in apps/api/.env.local, then start the services.");
  }
  // Service clients can keep the process alive, so exit explicitly.
  process.exit(failed ? 1 : 0);
}

void main();

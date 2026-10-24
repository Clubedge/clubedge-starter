// The variables a production deploy needs, for the modules this project uses. Hosts that only run
// the app (Vercel, Netlify) check them before the build with `pnpm check:env`, so a missing key
// stops the deploy instead of shipping an app whose features fail at runtime.
import { parseClientIpSettings } from "@clubedge/core";
import { isNeonPooledUrl } from "@clubedge/db/urls";

type Env = Record<string, string | undefined>;

/**
 * `url`: an absolute URL to a hosted service, not this machine. `serverless`: only on hosts that
 * run no long-lived process (Vercel, Netlify).
 */
export type Requirement = { key: string; use: string; url?: boolean; serverless?: boolean };

/** What every production deploy of this project needs. */
export function requiredVariables(env: Env): Requirement[] {
  const required: Requirement[] = [
    { key: "DATABASE_URL", use: "the database", url: true },
    { key: "NEXT_PUBLIC_APP_URL", use: "links in emails and redirects", url: true },
    // clubedge:if auth=supabase
    { key: "NEXT_PUBLIC_SUPABASE_URL", use: "Supabase Auth", url: true },
    { key: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", use: "Supabase Auth" },
    // clubedge:end
    // clubedge:if auth=better-auth
    { key: "BETTER_AUTH_SECRET", use: "Better Auth sessions" },
    // clubedge:end
    // clubedge:if auth=appwrite
    { key: "APPWRITE_ENDPOINT", use: "Appwrite", url: true },
    { key: "APPWRITE_PROJECT_ID", use: "Appwrite" },
    { key: "APPWRITE_API_KEY", use: "Appwrite" },
    // clubedge:end
    // clubedge:if auth=firebase
    { key: "FIREBASE_PROJECT_ID", use: "Firebase Authentication" },
    { key: "FIREBASE_API_KEY", use: "Firebase Authentication" },
    { key: "FIREBASE_CLIENT_EMAIL", use: "Firebase Authentication (the service account)" },
    { key: "FIREBASE_PRIVATE_KEY", use: "Firebase Authentication (the service account)" },
    // clubedge:end
    // clubedge:if cache=redis
    { key: "REDIS_URL", use: "the cache and rate limits", url: true },
    // clubedge:end
    // clubedge:if storage=s3
    { key: "STORAGE_BUCKET", use: "file storage" },
    { key: "STORAGE_ACCESS_KEY_ID", use: "file storage" },
    { key: "STORAGE_SECRET_ACCESS_KEY", use: "file storage" },
    // clubedge:end
    // clubedge:if email=smtp
    { key: "SMTP_URL", use: "email", url: true },
    // clubedge:end
    // clubedge:if email=resend
    { key: "RESEND_API_KEY", use: "email" },
    // clubedge:end
    // clubedge:if email=smtp|resend
    { key: "EMAIL_FROM", use: "the sender of every email" },
    // clubedge:end
    // clubedge:if payments=stripe
    { key: "STRIPE_SECRET_KEY", use: "payments" },
    { key: "STRIPE_WEBHOOK_SECRET", use: "payments" },
    { key: "STRIPE_PRICE_PRO", use: "payments" },
    // clubedge:end
    // clubedge:if jobs=pg-boss|bullmq
    // No jobs worker runs there: Vercel Cron or another scheduler calls /api/jobs/run with it.
    { key: "CRON_SECRET", use: "background jobs, run by a cron", serverless: true },
    // clubedge:end
    // clubedge:if jobs=inngest
    { key: "INNGEST_EVENT_KEY", use: "background jobs (Inngest's event key)" },
    { key: "INNGEST_SIGNING_KEY", use: "background jobs (Inngest's signing key)" },
    // clubedge:end
  ];
  const serverless = Boolean(env.VERCEL || env.NETLIFY);
  return required.filter((requirement) => serverless || !requirement.serverless);
}

/** The host of an absolute URL, or null for a value that isn't one. */
function urlHost(value: string): string | null {
  try {
    return new URL(value.trim()).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** A URL to this machine: from a development env file, unreachable from the deployed app. */
export function isLocalUrl(value: string): boolean {
  const host = urlHost(value);
  if (host === null) return false;
  return (
    ["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "host.docker.internal"].includes(host) ||
    host.endsWith(".localhost")
  );
}

export type ProductionEnvCheck = { missing: Requirement[]; local: string[]; invalid: string[] };

/** The required variables that are unset, point at this machine, or have an unusable value. */
export function checkProductionEnv(env: Env): ProductionEnvCheck {
  const required = requiredVariables(env);
  const missing = required.filter(({ key }) => !env[key]?.trim());
  const urls = required.filter(({ key, url }) => url && env[key]?.trim());
  const local = urls.filter(({ key }) => isLocalUrl(env[key]!)).map(({ key }) => key);
  const invalid = urls
    .filter(({ key }) => urlHost(env[key]!) === null)
    .map(({ key }) => `${key} is not an absolute URL`);
  // Optional, but migrations and the jobs worker use it instead of DATABASE_URL when it is set.
  const direct = env.DATABASE_URL_DIRECT?.trim();
  if (direct) {
    if (urlHost(direct) === null) invalid.push("DATABASE_URL_DIRECT is not an absolute URL");
    else if (!/^postgres(ql)?:\/\//i.test(direct)) {
      invalid.push("DATABASE_URL_DIRECT is not a postgresql:// URL");
    } else if (isLocalUrl(direct)) local.push("DATABASE_URL_DIRECT");
    else if (isNeonPooledUrl(direct)) {
      invalid.push("DATABASE_URL_DIRECT points at Neon's pooler: use the host without -pooler");
    }
  }
  // Optional too: where rate limits find the client's address (SETUP.md, "Client addresses").
  try {
    parseClientIpSettings(env);
  } catch (error) {
    invalid.push((error as Error).message);
  }
  // clubedge:if jobs=inngest
  // The Dev Server only runs on a developer's machine: production talks to Inngest Cloud.
  if (env.INNGEST_DEV?.trim() && !/^(0|false)$/i.test(env.INNGEST_DEV.trim())) {
    invalid.push("INNGEST_DEV is set: production uses Inngest Cloud's keys, so remove it");
  }
  // clubedge:end
  // clubedge:if auth=firebase
  // The emulator only runs on a developer's machine.
  if (env.FIREBASE_AUTH_EMULATOR_HOST?.trim()) {
    invalid.push(
      "FIREBASE_AUTH_EMULATOR_HOST is set: production uses your Firebase project, so remove it",
    );
  }
  // clubedge:end
  // clubedge:if auth=better-auth
  const secret = env.BETTER_AUTH_SECRET?.trim();
  if (secret && secret.length < 32) invalid.push("BETTER_AUTH_SECRET needs at least 32 characters");
  // clubedge:end
  // clubedge:if email=smtp|resend
  // .env.example's placeholder sender: providers refuse a domain you haven't verified.
  if (/@example\.com\b/i.test(env.EMAIL_FROM ?? "")) {
    invalid.push("EMAIL_FROM still uses example.com: set a sender on a domain you verified");
  }
  // clubedge:end
  return { missing, local, invalid };
}

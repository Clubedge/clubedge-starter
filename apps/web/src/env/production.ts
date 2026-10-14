// The variables a production deploy needs, for the modules this project uses. Hosts that only run
// the app (Vercel, Netlify) check them before the build with `pnpm check:env`, so a missing key
// stops the deploy instead of shipping an app whose features fail at runtime.

type Env = Record<string, string | undefined>;

/** `serverless`: only on hosts that run no long-lived process (Vercel, Netlify). */
export type Requirement = { key: string; use: string; serverless?: boolean };

/** Variables whose URL must reach a hosted service, not this machine. */
const urlKeys = ["DATABASE_URL", "NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_SUPABASE_URL", "REDIS_URL"];

/** What every production deploy of this project needs. */
export function requiredVariables(env: Env): Requirement[] {
  const required: Requirement[] = [
    { key: "DATABASE_URL", use: "the database" },
    { key: "NEXT_PUBLIC_APP_URL", use: "links in emails and redirects" },
    // clubedge:if auth=supabase
    { key: "NEXT_PUBLIC_SUPABASE_URL", use: "Supabase Auth" },
    { key: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", use: "Supabase Auth" },
    // clubedge:end
    // clubedge:if auth=better-auth
    { key: "BETTER_AUTH_SECRET", use: "Better Auth sessions" },
    // clubedge:end
    // clubedge:if cache=redis
    { key: "REDIS_URL", use: "the cache and rate limits" },
    // clubedge:end
    // clubedge:if storage=s3
    { key: "STORAGE_BUCKET", use: "file storage" },
    { key: "STORAGE_ACCESS_KEY_ID", use: "file storage" },
    { key: "STORAGE_SECRET_ACCESS_KEY", use: "file storage" },
    // clubedge:end
    // clubedge:if email=smtp
    { key: "SMTP_URL", use: "email" },
    // clubedge:end
    // clubedge:if email=resend
    { key: "RESEND_API_KEY", use: "email" },
    // clubedge:end
    // clubedge:if payments=stripe
    { key: "STRIPE_SECRET_KEY", use: "payments" },
    { key: "STRIPE_WEBHOOK_SECRET", use: "payments" },
    { key: "STRIPE_PRICE_PRO", use: "payments" },
    // clubedge:end
    // clubedge:if jobs=pg-boss
    // No jobs worker runs there: Vercel Cron or another scheduler calls /api/jobs/run with it.
    { key: "CRON_SECRET", use: "background jobs, run by a cron", serverless: true },
    // clubedge:end
  ];
  const serverless = Boolean(env.VERCEL || env.NETLIFY);
  return required.filter((requirement) => serverless || !requirement.serverless);
}

/** A URL to this machine: from a development env file, unreachable from the deployed app. */
export function isLocalUrl(value: string): boolean {
  let host: string;
  try {
    host = new URL(value).hostname.toLowerCase();
  } catch {
    return false;
  }
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
  const local = required
    .map(({ key }) => key)
    .filter((key) => urlKeys.includes(key) && env[key] && isLocalUrl(env[key]!));
  const invalid: string[] = [];
  // clubedge:if auth=better-auth
  const secret = env.BETTER_AUTH_SECRET?.trim();
  if (secret && secret.length < 32) invalid.push("BETTER_AUTH_SECRET needs at least 32 characters");
  // clubedge:end
  return { missing, local, invalid };
}

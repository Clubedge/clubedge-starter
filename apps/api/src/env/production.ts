// The variables a production deploy of the API needs, for the modules this project uses.
// `pnpm check:env` checks them in the deploy's environment, so a missing key stops the deploy
// instead of shipping an API whose features fail at runtime.
import { parseClientIpSettings } from "@clubedge/core";
import { isNeonPooledUrl } from "@clubedge/db/urls";
import { appVersionProblems } from "@/server/app-version";

type Env = Record<string, string | undefined>;

/** `url`: an absolute URL to a hosted service, not this machine. */
export type Requirement = { key: string; use: string; url?: boolean };

/** What every production deploy of this API needs. */
export function requiredVariables(): Requirement[] {
  return [
    { key: "DATABASE_URL", use: "the database", url: true },
    { key: "FRONTEND_URL", use: "the frontend's origin, for CORS and links", url: true }, // clubedge:only framework!=none
    // clubedge:if auth=supabase
    { key: "SUPABASE_URL", use: "Supabase Auth", url: true },
    { key: "SUPABASE_PUBLISHABLE_KEY", use: "Supabase Auth" },
    // clubedge:end
    // clubedge:if auth=better-auth && framework!=none
    { key: "BETTER_AUTH_URL", use: "Better Auth sessions, served by the frontend", url: true },
    // clubedge:end
    // clubedge:if auth=better-auth && framework=none
    {
      key: "BETTER_AUTH_URL",
      use: "Better Auth, which runs in this API: its public URL",
      url: true,
    },
    { key: "BETTER_AUTH_SECRET", use: "Better Auth's session cookies" },
    // clubedge:end
    // clubedge:if auth=appwrite
    { key: "APPWRITE_ENDPOINT", use: "Appwrite", url: true },
    { key: "APPWRITE_PROJECT_ID", use: "Appwrite" },
    // clubedge:end
    // clubedge:if auth=firebase
    { key: "FIREBASE_PROJECT_ID", use: "Firebase Authentication" },
    // clubedge:end
    // clubedge:if cache=redis
    { key: "REDIS_URL", use: "the rate limits and cache, shared by every instance", url: true },
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
    // clubedge:if jobs=inngest
    { key: "INNGEST_EVENT_KEY", use: "background jobs (Inngest's event key)" },
    { key: "INNGEST_SIGNING_KEY", use: "background jobs (Inngest's signing key)" },
    // clubedge:end
    // clubedge:if payments=stripe
    { key: "STRIPE_SECRET_KEY", use: "payments" },
    { key: "STRIPE_WEBHOOK_SECRET", use: "payments" },
    { key: "STRIPE_PRICE_PRO", use: "payments" },
    // clubedge:end
  ];
}

/** The host of an absolute URL, or null for a value that isn't one. */
function urlHost(value: string): string | null {
  try {
    return new URL(value.trim()).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** A URL to this machine: from a development env file, unreachable from the deployed API. */
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
  const required = requiredVariables();
  const missing = required.filter(({ key }) => !env[key]?.trim());
  const urls = required.filter(({ key, url }) => url && env[key]?.trim());
  const local = urls.filter(({ key }) => isLocalUrl(env[key]!)).map(({ key }) => key);
  const invalid = urls
    .filter(({ key }) => urlHost(env[key]!) === null)
    .map(({ key }) => `${key} is not an absolute URL`);
  // Optional, but migrations use it instead of DATABASE_URL when it is set.
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
  // Optional too: the versions /api/app-version tells the apps installed on phones.
  invalid.push(...appVersionProblems(env));
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
  // clubedge:if auth=better-auth && framework=none
  // Better Auth signs session cookies with it, and only warns about a short one.
  const authSecret = env.BETTER_AUTH_SECRET?.trim();
  if (authSecret && authSecret.length < 32) {
    invalid.push("BETTER_AUTH_SECRET is shorter than 32 characters: use openssl rand -hex 32");
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
  // clubedge:if push=native
  // A push service with only some of its credentials fails at its first notification.
  invalid.push(...pushCredentialProblems(env));
  // clubedge:end
  // clubedge:if email=smtp|resend
  // .env.example's placeholder sender: providers refuse a domain you haven't verified.
  if (/@example\.com\b/i.test(env.EMAIL_FROM ?? "")) {
    invalid.push("EMAIL_FROM still uses example.com: set a sender on a domain you verified");
  }
  // clubedge:end
  return { missing, local, invalid };
}
// clubedge:if push=native

/**
 * FCM's and APNs' credentials, each set whole or not at all: a platform whose service has none
 * gets no notifications, which may be deliberate, but half of them is a mistake.
 */
function pushCredentialProblems(env: Env): string[] {
  const services = {
    FCM: ["FCM_PROJECT_ID", "FCM_CLIENT_EMAIL", "FCM_PRIVATE_KEY"],
    APNs: ["APNS_KEY_ID", "APNS_TEAM_ID", "APNS_PRIVATE_KEY", "APNS_TOPIC"],
  };
  const problems = Object.entries(services).flatMap(([service, keys]) => {
    const unset = keys.filter((key) => !env[key]?.trim());
    return unset.length > 0 && unset.length < keys.length
      ? [`${service} needs ${unset.join(", ")} too`]
      : [];
  });
  const environment = env.APNS_ENVIRONMENT?.trim();
  if (environment && environment !== "production" && environment !== "development") {
    problems.push("APNS_ENVIRONMENT must be production or development");
  }
  return problems;
}
// clubedge:end

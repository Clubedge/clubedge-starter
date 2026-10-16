import { z } from "zod";
import { optional, parseEnv } from "./server";
// clubedge:if auth=better-auth|firebase
import { getAppUrl } from "./server";
// clubedge:end

// All auth runs on the server, so these variables need no browser prefix.

// clubedge:if auth=supabase
const supabaseAuthSchema = z.object({
  SUPABASE_URL: optional(z.url()),
  SUPABASE_PUBLISHABLE_KEY: optional(z.string()),
  // Lets users delete their account from the settings page.
  SUPABASE_SECRET_KEY: optional(z.string()),
});

export interface SupabaseAuthEnv {
  url: string;
  publishableKey: string;
  secretKey?: string;
}

/** Supabase Auth settings, or null while they are not configured. */
export function getSupabaseAuthEnv(): SupabaseAuthEnv | null {
  const env = parseEnv(supabaseAuthSchema, "Supabase Auth");
  const url = env.SUPABASE_URL;
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) return null;
  return {
    url,
    publishableKey,
    ...(env.SUPABASE_SECRET_KEY ? { secretKey: env.SUPABASE_SECRET_KEY } : {}),
  };
}
// clubedge:end

// clubedge:if auth=better-auth
const betterAuthSchema = z.object({
  BETTER_AUTH_SECRET: optional(
    z.string().min(32, "BETTER_AUTH_SECRET needs at least 32 characters"),
  ),
  // "true" refuses sign-in until the email address is confirmed (needs the email module).
  BETTER_AUTH_REQUIRE_EMAIL_VERIFICATION: optional(z.enum(["true", "false"])),
});

export interface BetterAuthEnv {
  secret: string;
  baseUrl: string;
  requireEmailVerification: boolean;
}

/** Better Auth settings, or null until BETTER_AUTH_SECRET is set. */
export function getBetterAuthEnv(): BetterAuthEnv | null {
  const env = parseEnv(betterAuthSchema, "Better Auth");
  if (!env.BETTER_AUTH_SECRET) return null;
  return {
    secret: env.BETTER_AUTH_SECRET,
    baseUrl: getAppUrl(),
    requireEmailVerification: env.BETTER_AUTH_REQUIRE_EMAIL_VERIFICATION === "true",
  };
}
// clubedge:end

// clubedge:if auth=firebase
const firebaseAuthSchema = z.object({
  FIREBASE_PROJECT_ID: optional(z.string()),
  // The project's Web API key: Project settings, General.
  FIREBASE_API_KEY: optional(z.string()),
  // A service account: Project settings, Service accounts. Not needed with the emulator.
  FIREBASE_CLIENT_EMAIL: optional(z.string()),
  FIREBASE_PRIVATE_KEY: optional(z.string()),
  // The Auth Emulator (pnpm auth:dev) in development, such as 127.0.0.1:9099.
  FIREBASE_AUTH_EMULATOR_HOST: optional(z.string()),
});

export interface FirebaseAuthEnv {
  projectId: string;
  apiKey: string;
  clientEmail?: string;
  privateKey?: string;
  emulatorHost?: string;
  baseUrl: string;
}

/** Firebase Auth settings, or null until the project id and Web API key are set. */
export function getFirebaseAuthEnv(): FirebaseAuthEnv | null {
  const env = parseEnv(firebaseAuthSchema, "Firebase Auth");
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_API_KEY) return null;
  return {
    projectId: env.FIREBASE_PROJECT_ID,
    apiKey: env.FIREBASE_API_KEY,
    ...(env.FIREBASE_CLIENT_EMAIL ? { clientEmail: env.FIREBASE_CLIENT_EMAIL } : {}),
    ...(env.FIREBASE_PRIVATE_KEY ? { privateKey: env.FIREBASE_PRIVATE_KEY } : {}),
    ...(env.FIREBASE_AUTH_EMULATOR_HOST ? { emulatorHost: env.FIREBASE_AUTH_EMULATOR_HOST } : {}),
    baseUrl: getAppUrl(),
  };
}
// clubedge:end

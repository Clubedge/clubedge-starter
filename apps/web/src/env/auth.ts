import { z } from "zod";
import { optional, parseEnv } from "./server";

// Read by the composition root and by the proxy, which cannot import server-only modules.

// clubedge:if auth=supabase
const supabaseAuthSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: optional(z.url()),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: optional(z.string()),
});

export interface SupabaseAuthEnv {
  url: string;
  publishableKey: string;
}

/** Supabase Auth settings, or null while they are not configured. */
export function getSupabaseAuthEnv(): SupabaseAuthEnv | null {
  const env = parseEnv(supabaseAuthSchema, "Supabase Auth");
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return url && publishableKey ? { url, publishableKey } : null;
}
// clubedge:end

// clubedge:if auth=better-auth
const betterAuthSchema = z.object({
  BETTER_AUTH_SECRET: optional(
    z.string().min(32, "BETTER_AUTH_SECRET needs at least 32 characters"),
  ),
  NEXT_PUBLIC_APP_URL: optional(z.url()),
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
    baseUrl: env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    requireEmailVerification: env.BETTER_AUTH_REQUIRE_EMAIL_VERIFICATION === "true",
  };
}
// clubedge:end

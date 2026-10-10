import { z } from "zod";
import { optional, parseEnv } from "./server";

// All auth runs on the server, so these variables need no browser prefix.
const supabaseAuthSchema = z.object({
  SUPABASE_URL: optional(z.url()),
  SUPABASE_PUBLISHABLE_KEY: optional(z.string()),
});

export interface SupabaseAuthEnv {
  url: string;
  publishableKey: string;
}

/** Supabase Auth settings, or null while they are not configured. */
export function getSupabaseAuthEnv(): SupabaseAuthEnv | null {
  const env = parseEnv(supabaseAuthSchema, "Supabase Auth");
  const url = env.SUPABASE_URL;
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY;
  return url && publishableKey ? { url, publishableKey } : null;
}

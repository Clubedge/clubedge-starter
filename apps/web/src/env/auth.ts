import { z } from "zod";
import { optional, parseEnv } from "./server";

// Read by the composition root and by the proxy, which cannot import server-only modules.
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

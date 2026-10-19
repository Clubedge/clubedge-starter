import { createClient } from "@supabase/supabase-js";

/** Browser client for a separate frontend. The API verifies its access token on every request. */
export function createSupabaseBrowserClient(url: string, publishableKey: string) {
  return createClient(url, publishableKey, {
    auth: { autoRefreshToken: true, detectSessionInUrl: true, persistSession: true },
  });
}

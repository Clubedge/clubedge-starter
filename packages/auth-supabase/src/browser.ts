import { createClient, type SupportedStorage } from "@supabase/supabase-js";

/**
 * Browser client for a separate frontend. The API verifies its access token on every request.
 * `options` changes where the session is kept (localStorage by default) and under which key, and
 * whether a session in the page's address, from an emailed link, is taken up.
 */
export function createSupabaseBrowserClient(
  url: string,
  publishableKey: string,
  options: { storage?: SupportedStorage; storageKey?: string; detectSessionInUrl?: boolean } = {},
) {
  return createClient(url, publishableKey, {
    auth: { autoRefreshToken: true, detectSessionInUrl: true, persistSession: true, ...options },
  });
}

import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { err, ok } from "@clubedge/core";
import type { AuthProvider, AuthUser, CookieStore } from "./types";

export interface SupabaseAuthConfig {
  url: string;
  publishableKey: string;
  cookies: CookieStore;
}

/** A request-scoped Supabase client. Storage adapters can reuse it for user-scoped access. */
export function createSupabaseServerClient({ url, publishableKey, cookies }: SupabaseAuthConfig) {
  return createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => cookies.getAll(),
      setAll: (values) => cookies.setAll(values),
    } satisfies CookieMethodsServer,
  });
}

function toAuthUser(user: User): AuthUser {
  return { id: user.id, email: user.email ?? null };
}

export function createSupabaseAuth(config: SupabaseAuthConfig): AuthProvider {
  const supabase = createSupabaseServerClient(config);

  return {
    async getUser() {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) return null;
      return toAuthUser(data.user);
    },
    async signInWithPassword(credentials) {
      const { data, error } = await supabase.auth.signInWithPassword(credentials);
      if (error || !data.user) return err("invalid-credentials");
      return ok(toAuthUser(data.user));
    },
    async signUp({ emailRedirectTo, ...credentials }) {
      const { data, error } = await supabase.auth.signUp({
        ...credentials,
        options: { emailRedirectTo },
      });
      if (error) return err("signup-failed");
      return ok({
        user: data.user ? toAuthUser(data.user) : null,
        needsConfirmation: !data.session,
      });
    },
    async exchangeCodeForSession(code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) return err("invalid-code");
      return ok(data.user ? toAuthUser(data.user) : null);
    },
    async refreshSession() {
      // getUser() validates the JWT with Supabase and rotates the cookies when needed.
      await supabase.auth.getUser();
    },
    async signOut() {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },
  };
}

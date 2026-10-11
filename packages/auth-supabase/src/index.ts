import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { err, ok } from "@clubedge/core";
import type { AuthProvider, AuthUser, CookieStore } from "@clubedge/auth";

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
    // Supabase sends its own reset emails, configured in the Supabase project.
    canResetPassword: true,
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
    async requestPasswordReset({ email, redirectTo }) {
      // The link goes through the auth callback, which creates a session for resetPassword.
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      // Never reveal whether the address has an account; log other failures for operators.
      if (error) console.error("Supabase could not send the password reset email", error.message);
    },
    async resetPassword({ password }) {
      const { error } = await supabase.auth.updateUser({ password });
      return error ? err("invalid-reset") : ok(undefined);
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

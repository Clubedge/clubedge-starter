import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import { createClient, type User } from "@supabase/supabase-js";
import { err, ok } from "@clubedge/core";
import type { AuthProvider, AuthUser, CookieStore } from "@clubedge/auth";

export interface SupabaseAuthConfig {
  url: string;
  publishableKey: string;
  cookies: CookieStore;
  /** The project's secret key, server-side only; needed to delete accounts. */
  secretKey?: string;
}

/** Verifies a bearer token with Supabase Auth and maps it to the API's public user shape. */
export async function getSupabaseBearerUser(
  url: string,
  publishableKey: string,
  token: string,
): Promise<{ id: string; email: string; displayName: string | null } | null> {
  const client = createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user?.email) return null;
  const metadata = data.user.user_metadata;
  const displayName = metadata.full_name ?? metadata.name ?? null;
  return {
    id: data.user.id,
    email: data.user.email,
    displayName: typeof displayName === "string" ? displayName : null,
  };
}

/**
 * A Supabase client that acts as the user who holds a bearer token, for an API that receives
 * the browser's access token instead of session cookies. Row-level security policies, such as
 * Storage bucket policies, see that user; without a token the client acts as anonymous.
 */
export function createSupabaseBearerClient(url: string, publishableKey: string, token?: string) {
  return createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    ...(token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {}),
  });
}

/** A request-scoped Supabase client. Storage adapters can reuse it for user-scoped access. */
export function createSupabaseServerClient({
  url,
  publishableKey,
  cookies,
}: Pick<SupabaseAuthConfig, "url" | "publishableKey" | "cookies">) {
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

  /** The signed-in user, once their password is confirmed by signing in with it again. */
  async function confirmPassword(password: string) {
    const { data } = await supabase.auth.getUser();
    if (!data.user?.email) return err("not-signed-in" as const);
    const { error } = await supabase.auth.signInWithPassword({ email: data.user.email, password });
    return error ? err("invalid-password" as const) : ok(data.user);
  }

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
    async changePassword({ currentPassword, newPassword }) {
      const confirmed = await confirmPassword(currentPassword);
      if (!confirmed.ok) return confirmed;
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      // Sessions on other devices end; this one stays signed in.
      const { error: signOutError } = await supabase.auth.signOut({ scope: "others" });
      if (signOutError) throw signOutError;
      return ok(undefined);
    },
    canDeleteAccount: Boolean(config.secretKey),
    async deleteAccount({ password, beforeDelete }) {
      if (!config.secretKey) return err("not-supported");
      const confirmed = await confirmPassword(password);
      if (!confirmed.ok) return confirmed;
      await beforeDelete?.();
      // Deleting a user is an admin operation, so it needs the secret key's client.
      const admin = createClient(config.url, config.secretKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error } = await admin.auth.admin.deleteUser(confirmed.value.id);
      if (error) throw error;
      // The user no longer exists, so only this browser's session cookies need clearing.
      await supabase.auth.signOut({ scope: "local" });
      return ok(undefined);
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

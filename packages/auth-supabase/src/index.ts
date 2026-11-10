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

// One client for each project, kept for the life of the process, to verify tokens with: it keeps
// the project's signing keys once fetched (for ten minutes, auth-js's JWKS_TTL).
const verifiers = new Map<string, ReturnType<typeof createClient>["auth"]>();

function verifierFor(url: string, publishableKey: string) {
  const key = `${url}\n${publishableKey}`;
  let auth = verifiers.get(key);
  if (!auth) {
    auth = createClient(url, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    }).auth;
    verifiers.set(key, auth);
  }
  return auth;
}

/**
 * Verifies a bearer token and maps it to the API's public user shape. A token signed with the
 * project's asymmetric key (ES256 or RS256, Supabase's default signing keys) is verified here,
 * against the public keys the project publishes, rather than with a request to Supabase Auth for
 * every request the API serves. Whatever cannot be settled here (a project signing with a shared
 * secret, keys out of reach, claims not as a signed-in user's are) is asked of Supabase Auth, as
 * before, so no token it takes is refused. As with any signed token, one whose session ended
 * elsewhere keeps working until it expires (an hour by default); the app stops sending it then.
 * Only a signed-in user's token is taken: not the project's own keys (`anon`, `service_role`), nor
 * an anonymous session, which has no email.
 */
export async function getSupabaseBearerUser(
  url: string,
  publishableKey: string,
  token: string,
): Promise<{ id: string; email: string; displayName: string | null } | null> {
  const auth = verifierFor(url, publishableKey);
  const verified = await auth.getClaims(token).catch(() => null);
  const claims = verified?.data?.claims;
  if (
    claims?.role === "authenticated" &&
    claims.sub &&
    typeof claims.email === "string" &&
    claims.email
  ) {
    return toBearerUser(claims.sub, claims.email, claims.user_metadata);
  }
  const { data, error } = await auth.getUser(token);
  if (error || !data.user?.email) return null;
  return toBearerUser(data.user.id, data.user.email, data.user.user_metadata);
}

function toBearerUser(id: string, email: string, metadata: Record<string, unknown> | undefined) {
  const displayName = metadata?.full_name ?? metadata?.name ?? null;
  return { id, email, displayName: typeof displayName === "string" ? displayName : null };
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

import type { Result } from "@clubedge/core";

export interface AuthUser {
  id: string;
  email: string | null;
}

export interface Credentials {
  email: string;
  password: string;
}

export interface CookieOptions {
  domain?: string;
  path?: string;
  expires?: Date;
  maxAge?: number;
  httpOnly?: boolean;
  secure?: boolean;
  partitioned?: boolean;
  priority?: "low" | "medium" | "high";
  sameSite?: boolean | "lax" | "strict" | "none";
}

export interface CookieToSet {
  name: string;
  value: string;
  options?: CookieOptions;
}

/**
 * The only thing an auth adapter needs from the web framework. Each app bridges its own
 * request and response cookies (Next.js `cookies()`, TanStack Start helpers, and so on).
 */
export interface CookieStore {
  getAll(): Array<{ name: string; value: string }>;
  /** May throw where cookies are read-only, such as React Server Components. */
  setAll(cookies: CookieToSet[]): void;
}

export interface SignUpOutcome {
  user: AuthUser | null;
  /** True when the provider requires email confirmation before a session exists. */
  needsConfirmation: boolean;
}

/** Application code depends on this interface, never on a provider SDK. */
export interface AuthProvider {
  /** Returns the user verified with the provider, not just decoded from a cookie. */
  getUser(): Promise<AuthUser | null>;
  signInWithPassword(
    credentials: Credentials,
  ): Promise<Result<AuthUser, "invalid-credentials" | "email-not-verified">>;
  signUp(
    credentials: Credentials & { emailRedirectTo: string },
  ): Promise<Result<SignUpOutcome, "signup-failed">>;
  exchangeCodeForSession(code: string): Promise<Result<AuthUser | null, "invalid-code">>;
  /** Whether this provider can email password reset links. */
  readonly canResetPassword: boolean;
  /**
   * Emails a password reset link. Never reveals whether the address has an account. Providers
   * that confirm links through the app's auth callback (Supabase) send the user to `redirectTo`;
   * Better Auth links to the app's /reset-password page itself.
   */
  requestPasswordReset(input: { email: string; redirectTo: string }): Promise<void>;
  /**
   * Sets a new password from a reset link: with the link's token (Better Auth), or with the
   * session the link created through the auth callback (Supabase).
   */
  resetPassword(input: {
    password: string;
    token?: string;
  }): Promise<Result<void, "invalid-reset">>;
  /** Validates the session and writes refreshed cookies; call it from request middleware. */
  refreshSession(): Promise<void>;
  signOut(): Promise<void>;
}

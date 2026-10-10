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
  signInWithPassword(credentials: Credentials): Promise<Result<AuthUser, "invalid-credentials">>;
  signUp(
    credentials: Credentials & { emailRedirectTo: string },
  ): Promise<Result<SignUpOutcome, "signup-failed">>;
  exchangeCodeForSession(code: string): Promise<Result<AuthUser | null, "invalid-code">>;
  /** Validates the session and writes refreshed cookies; call it from request middleware. */
  refreshSession(): Promise<void>;
  signOut(): Promise<void>;
}

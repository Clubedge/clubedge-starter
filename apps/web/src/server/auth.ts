import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { AuthProvider, AuthUser, CookieStore } from "@clubedge/auth";
import { createSupabaseAuth, createSupabaseServerClient } from "@clubedge/auth-supabase";
import { AppError } from "@clubedge/core";
import { getSupabaseAuthEnv } from "@/env/auth";
import { loginUrl } from "@/lib/login-url";

export type { AuthUser } from "@clubedge/auth";

export function isAuthConfigured(): boolean {
  return getSupabaseAuthEnv() !== null;
}

/** Bridges Next.js request cookies to the framework-agnostic CookieStore. */
async function nextCookieStore(): Promise<CookieStore> {
  const cookieStore = await cookies();
  return {
    getAll: () => cookieStore.getAll(),
    setAll(values) {
      try {
        values.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
      } catch {
        // Server Components cannot write cookies. The proxy refreshes sessions instead.
      }
    },
  };
}

function supabaseConfig(cookieStore: CookieStore) {
  const env = getSupabaseAuthEnv();
  if (!env) throw new Error("Supabase Auth is not configured.");
  return { ...env, cookies: cookieStore };
}

/** Request-scoped auth provider. Throws when authentication is not configured. */
export async function getAuth(): Promise<AuthProvider> {
  return createSupabaseAuth(supabaseConfig(await nextCookieStore()));
}

/** Request-scoped Supabase client for provider features such as Storage. */
export async function getSupabaseClient() {
  return createSupabaseServerClient(supabaseConfig(await nextCookieStore()));
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  if (!isAuthConfigured()) return null;
  return (await getAuth()).getUser();
}

/** For route handlers and server actions: throws a 401 AppError when signed out. */
export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw new AppError("Authentication required.", "UNAUTHENTICATED", 401);
  return user;
}

/**
 * For pages: redirects signed-out visitors to the login page and back afterwards.
 * Returns null while authentication is not configured so the starter stays explorable.
 */
export async function getPageUser(pathname: string): Promise<AuthUser | null> {
  // Render per request: configuration is read at run time, so a page prerendered at build
  // time without auth settings must never be served once they are set.
  await connection();
  if (!isAuthConfigured()) return null;
  const user = await getCurrentUser();
  if (!user) redirect(loginUrl({ next: pathname }));
  return user;
}

import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { AuthProvider, AuthUser } from "@clubedge/auth";
import { createAppwriteAuth } from "@clubedge/auth-appwrite";
import { AppError } from "@clubedge/core";
import { getAppwriteAuthEnv } from "@/env/auth";
import { loginUrl } from "@/lib/login-url";
import { nextCookieStore } from "@/server/cookies";

export type { AuthUser } from "@clubedge/auth";

export function isAuthConfigured(): boolean {
  return getAppwriteAuthEnv() !== null;
}

/** Request-scoped auth provider. Throws when authentication is not configured. */
export async function getAuth(): Promise<AuthProvider> {
  const env = getAppwriteAuthEnv();
  if (!env) throw new Error("Appwrite is not configured.");
  return createAppwriteAuth({ ...env, cookies: await nextCookieStore() });
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

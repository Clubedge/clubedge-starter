import "@tanstack/react-start/server-only";
import type { AuthProvider, AuthUser } from "@clubedge/auth";
import { createAppwriteAuth } from "@clubedge/auth-appwrite";
import { AppError, reportError } from "@clubedge/core";
import { getAppwriteAuthEnv } from "@/env/auth";
import { requestCookieStore } from "@/server/cookies";

export type { AuthUser } from "@clubedge/auth";

export function isAuthConfigured(): boolean {
  return getAppwriteAuthEnv() !== null;
}

/** Request-scoped auth provider. Throws when authentication is not configured. */
export function getAuth(): AuthProvider {
  const env = getAppwriteAuthEnv();
  if (!env) throw new Error("Appwrite is not configured.");
  return createAppwriteAuth({ ...env, cookies: requestCookieStore() });
}

/** Validates the session. Runs once per request from src/start.ts. */
export async function refreshAuthSession(): Promise<void> {
  if (!isAuthConfigured()) return;
  try {
    await getAuth().refreshSession();
  } catch (error) {
    // Pages still render; protected handlers re-check the user and reject when needed.
    reportError(error, { message: "Session refresh failed" });
  }
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  if (!isAuthConfigured()) return null;
  return getAuth().getUser();
}

/** For server functions and routes: throws a 401 AppError when signed out. */
export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw new AppError("Authentication required.", "UNAUTHENTICATED", 401);
  return user;
}

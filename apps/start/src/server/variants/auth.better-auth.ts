import "@tanstack/react-start/server-only";
import type { AuthProvider, AuthUser } from "@clubedge/auth";
import {
  createBetterAuth,
  createBetterAuthServer,
  drizzleDatabase,
  type BetterAuthServer,
} from "@clubedge/auth-better-auth";
import { siteConfig } from "@/config/site";
import { authEmailSender } from "@/server/auth-email";
import { AppError } from "@clubedge/core";
import { getBetterAuthEnv } from "@/env/auth";
import { requestCookieStore } from "@/server/cookies";
import { getDb } from "@/server/db";

export type { AuthUser } from "@clubedge/auth";

export function isAuthConfigured(): boolean {
  return getBetterAuthEnv() !== null;
}

let server: BetterAuthServer | undefined;

/** One Better Auth server per process, storing users and sessions in the app database. */
function getServer(): BetterAuthServer {
  if (server) return server;
  const env = getBetterAuthEnv();
  if (!env) throw new Error("Better Auth is not configured.");
  server = createBetterAuthServer({
    database: drizzleDatabase(getDb()),
    ...env,
    sendEmail: authEmailSender(),
    appName: siteConfig.name,
  });
  return server;
}

/** Request-scoped auth provider. Throws when authentication is not configured. */
export function getAuth(): AuthProvider {
  return createBetterAuth({ server: getServer(), cookies: requestCookieStore() });
}

/** Validates the session and rotates its cookies. Runs once per request from src/start.ts. */
export async function refreshAuthSession(): Promise<void> {
  if (!isAuthConfigured()) return;
  try {
    await getAuth().refreshSession();
  } catch (error) {
    // Pages still render; protected handlers re-check the user and reject when needed.
    console.error("Session refresh failed", error);
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

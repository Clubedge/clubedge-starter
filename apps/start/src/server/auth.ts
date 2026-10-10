import "@tanstack/react-start/server-only";
import type { AuthProvider, AuthUser } from "@clubedge/auth";
import { createSupabaseAuth, createSupabaseServerClient } from "@clubedge/auth/supabase";
import { AppError } from "@clubedge/core";
import { getSupabaseAuthEnv } from "@/env/server";
import { requestCookieStore } from "./cookies";

export type { AuthUser } from "@clubedge/auth";

export function isAuthConfigured(): boolean {
  return getSupabaseAuthEnv() !== null;
}

function supabaseConfig() {
  const env = getSupabaseAuthEnv();
  if (!env) throw new Error("Supabase Auth is not configured.");
  return { ...env, cookies: requestCookieStore() };
}

/** Request-scoped auth provider. Throws when authentication is not configured. */
export function getAuth(): AuthProvider {
  return createSupabaseAuth(supabaseConfig());
}

/** Request-scoped Supabase client for provider features such as Storage. */
export async function getSupabaseClient() {
  return createSupabaseServerClient(supabaseConfig());
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

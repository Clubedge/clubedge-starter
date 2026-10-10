import "server-only";
import { redirect } from "next/navigation";
import { hasSupabaseAuthConfig } from "@/env/client";
import { AppError } from "@/lib/errors";
import { loginUrl } from "./redirect";
import { supabaseAuthProvider } from "./supabase";
import type { AuthUser } from "./types";

export type { AuthUser, AuthProvider } from "./types";

/** Application code depends on this stable interface, not the Supabase SDK. */
export const auth = supabaseAuthProvider;

export const isAuthConfigured = hasSupabaseAuthConfig;

/** For route handlers and server actions: throws a 401 AppError when signed out. */
export async function requireUser(): Promise<AuthUser> {
  const user = await auth.getUser();
  if (!user) throw new AppError("Authentication required.", "UNAUTHENTICATED", 401);
  return user;
}

/**
 * For pages: redirects signed-out visitors to the login page and back afterwards.
 * Returns null while authentication is not configured so the starter stays explorable.
 */
export async function getPageUser(pathname: string): Promise<AuthUser | null> {
  if (!isAuthConfigured) return null;
  const user = await auth.getUser();
  if (!user) redirect(loginUrl({ next: pathname }));
  return user;
}

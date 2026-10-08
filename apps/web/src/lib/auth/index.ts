import "server-only";
import { supabaseAuthProvider } from "./supabase";
import type { AuthUser } from "./types";

export type { AuthUser, AuthProvider } from "./types";

/** Application code depends on this stable interface, not the Supabase SDK. */
export const auth = supabaseAuthProvider;

export async function requireUser(): Promise<AuthUser> {
  const user = await auth.getUser();
  if (!user) throw new Error("Authentication required.");
  return user;
}

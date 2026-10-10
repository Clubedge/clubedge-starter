import "@tanstack/react-start/server-only";
import { AppError } from "@clubedge/core";

// This project was created without authentication. These helpers keep the contract the pages
// rely on, so adding a provider later means replacing this file and adding a login flow.

export interface AuthUser {
  id: string;
  email: string | null;
}

export function isAuthConfigured(): boolean {
  return false;
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  return null;
}

/** Called by the request middleware in src/start.ts. */
export async function refreshAuthSession(): Promise<void> {
  // There are no sessions to refresh without authentication.
}

/** Server functions and routes that need a user always refuse: there is no way to sign in. */
export async function requireUser(): Promise<AuthUser> {
  throw new AppError("This application has no authentication.", "UNAUTHENTICATED", 401);
}

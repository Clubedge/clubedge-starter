import "server-only";
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

/** Route handlers that need a user always refuse: there is no way to sign in. */
export async function requireUser(): Promise<AuthUser> {
  throw new AppError("This application has no authentication.", "UNAUTHENTICATED", 401);
}

/** Pages render for everyone. */
export const getPageUser: (pathname: string) => Promise<AuthUser | null> = async () => null;

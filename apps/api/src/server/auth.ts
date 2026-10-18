import type { User } from "@clubedge/contract";

/**
 * The signed-in user for a request. This API has no authentication module yet, so nobody is
 * signed in; an auth provider replaces this file the way the full-stack apps' variants do.
 */
export async function getCurrentUser(): Promise<User | null> {
  return null;
}

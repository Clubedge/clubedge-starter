import type { User } from "@clubedge/contract";

/**
 * The signed-in user for a request. This API has no authentication module yet, so nobody is
 * signed in; an auth provider replaces this file the way the full-stack apps' variants do.
 */
export async function getCurrentUser(
  _request: Request,
  _config?: { url: string; publishableKey: string },
): Promise<User | null> {
  void _request;
  void _config;
  return null;
}

// clubedge:if auth!=none
// An auth provider's file replaces this one, with these two working; the Starter's workspace
// compiles src/server/account.ts against them.
export function canDeleteAccount(): boolean {
  return false;
}

export async function deleteAccount(_input: {
  user: User;
  password: string;
  request: Request;
  beforeDelete(): Promise<void>;
}) {
  void _input;
  return "not-supported" as const;
}
// clubedge:end

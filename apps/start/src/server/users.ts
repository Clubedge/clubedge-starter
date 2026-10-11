import "@tanstack/react-start/server-only";
import type { AuthUser } from "@clubedge/auth";
import { ensureUserId, upsertUserProfile } from "@clubedge/db";
import { getDb } from "./db";
import { reportError } from "@clubedge/core";

/**
 * Keeps the app-owned users row in step with the identity provider. Failures are logged
 * rather than thrown so a database outage does not block an otherwise valid sign-in.
 */
export async function ensureUserProfile(user: AuthUser | null): Promise<void> {
  if (!user?.email) return;
  try {
    await upsertUserProfile(getDb(), { authUserId: user.id, email: user.email });
  } catch (error) {
    reportError(error, { message: "Could not sync the user profile" });
  }
}

/** The app-owned users row id for a signed-in user, creating the row if needed. */
export async function getUserProfileId(user: AuthUser & { email: string }): Promise<string> {
  return ensureUserId(getDb(), { authUserId: user.id, email: user.email });
}

import "server-only";
import type { AuthUser } from "@clubedge/auth";
import { upsertUserProfile } from "@clubedge/db";
import { getDb } from "./db";

/**
 * Keeps the app-owned users row in step with the identity provider. Failures are logged
 * rather than thrown so a database outage does not block an otherwise valid sign-in.
 */
export async function ensureUserProfile(user: AuthUser | null): Promise<void> {
  if (!user?.email) return;
  try {
    await upsertUserProfile(getDb(), { authUserId: user.id, email: user.email });
  } catch (error) {
    console.error("Could not sync the user profile", error);
  }
}

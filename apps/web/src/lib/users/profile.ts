import "server-only";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import type { AuthUser } from "@/lib/auth";

/**
 * Keeps the app-owned users row in step with the identity provider. Failures are logged
 * rather than thrown so a database outage does not block an otherwise valid sign-in.
 */
export async function ensureUserProfile(user: AuthUser): Promise<void> {
  if (!user.email) return;

  try {
    await getDb()
      .insert(users)
      .values({ authUserId: user.id, email: user.email })
      .onConflictDoUpdate({
        target: users.authUserId,
        set: { email: user.email, updatedAt: new Date() },
      });
  } catch (error) {
    console.error("Could not sync the user profile", error);
  }
}

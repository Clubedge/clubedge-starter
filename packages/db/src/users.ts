import type { Database } from "./client";
import { users } from "./schema";

/** Creates or updates the app-owned profile row for an identity-provider user. */
export async function upsertUserProfile(
  db: Database,
  profile: { authUserId: string; email: string },
): Promise<void> {
  await db
    .insert(users)
    .values(profile)
    .onConflictDoUpdate({
      target: users.authUserId,
      set: { email: profile.email, updatedAt: new Date() },
    });
}

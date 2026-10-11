import { eq } from "drizzle-orm";
import type { Database } from "./client";
import { users } from "./schema";

/** Creates or updates the app-owned profile row for an identity-provider user; returns its id. */
export async function upsertUserProfile(
  db: Database,
  profile: { authUserId: string; email: string },
): Promise<string> {
  const [row] = await db
    .insert(users)
    .values(profile)
    .onConflictDoUpdate({
      target: users.authUserId,
      set: { email: profile.email, updatedAt: new Date() },
    })
    .returning({ id: users.id });
  return row!.id;
}

/**
 * The users row id for an identity-provider user. Reads first, so pages that only need the id do
 * not write; creates the row when it is missing.
 */
export async function ensureUserId(
  db: Database,
  profile: { authUserId: string; email: string },
): Promise<string> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.authUserId, profile.authUserId))
    .limit(1);
  return row?.id ?? upsertUserProfile(db, profile);
}

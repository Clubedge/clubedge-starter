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

/** The display name the user chose, or null. */
export async function getDisplayName(db: Database, userId: string): Promise<string | null> {
  const [row] = await db
    .select({ displayName: users.displayName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.displayName ?? null;
}

/** Sets or clears (with null) the display name. */
export async function setDisplayName(
  db: Database,
  userId: string,
  displayName: string | null,
): Promise<void> {
  await db.update(users).set({ displayName, updatedAt: new Date() }).where(eq(users.id, userId));
}

/**
 * Deletes the app-owned profile of an identity-provider user. Tables that reference users, such
 * as subscriptions, delete their rows with it.
 */
export async function deleteUserProfile(db: Database, authUserId: string): Promise<void> {
  await db.delete(users).where(eq(users.authUserId, authUserId));
}

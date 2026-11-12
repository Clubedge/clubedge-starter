import { eq } from "drizzle-orm";
import type { Database } from "./client";
import { users } from "./schema";

/** The users row id of an identity-provider user, if it has one. */
async function userIdOf(db: Database, authUserId: string): Promise<string | undefined> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.authUserId, authUserId))
    .limit(1);
  return row?.id;
}

/** Whether an error is PostgreSQL's unique violation (23505), as the driver or Drizzle raises it. */
function isUniqueViolation(error: unknown): boolean {
  const code = (value: unknown) =>
    typeof value === "object" && value !== null && "code" in value ? value.code : undefined;
  const cause =
    typeof error === "object" && error !== null && "cause" in error ? error.cause : undefined;
  return code(error) === "23505" || code(cause) === "23505";
}

/**
 * The users row of another identity-provider user has this one's email address, which is
 * unique, so this user can't have a row of its own.
 */
function emailTaken(): Error {
  return new Error(
    "Another users row has this user's email address, so it can't have one of its own.",
  );
}

/** Creates or updates the app-owned profile row for an identity-provider user; returns its id. */
export async function upsertUserProfile(
  db: Database,
  profile: { authUserId: string; email: string },
): Promise<string> {
  try {
    const [row] = await db
      .insert(users)
      .values(profile)
      .onConflictDoUpdate({
        target: users.authUserId,
        set: { email: profile.email, updatedAt: new Date() },
      })
      .returning({ id: users.id });
    return row!.id;
  } catch (error) {
    // A user's first requests can insert at once. The conflict target settles only auth_user_id,
    // so the email's unique index stops all but one, whose row the others then read.
    const id = isUniqueViolation(error) ? await userIdOf(db, profile.authUserId) : undefined;
    if (id) return id;
    throw error;
  }
}

/**
 * The users row id for an identity-provider user. Reads first, so pages that only need the id do
 * not write; creates the row when it is missing.
 */
export async function ensureUserId(
  db: Database,
  profile: { authUserId: string; email: string },
): Promise<string> {
  const existing = await userIdOf(db, profile.authUserId);
  if (existing) return existing;
  // Without a conflict target, every unique index settles the race between a user's first
  // requests, which can insert at once: one inserts the row, and the others read it.
  const [created] = await db
    .insert(users)
    .values(profile)
    .onConflictDoNothing()
    .returning({ id: users.id });
  const id = created?.id ?? (await userIdOf(db, profile.authUserId));
  if (!id) throw emailTaken();
  return id;
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

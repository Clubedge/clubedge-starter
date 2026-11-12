import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Database } from "./client";
import {
  deleteUserProfile,
  ensureUserId,
  getDisplayName,
  setDisplayName,
  upsertUserProfile,
} from "./users";

/** A fresh PostgreSQL (PGlite) with the app's migrations applied. */
async function database() {
  const db = drizzle({ client: await PGlite.create() });
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
  // The query builder is the same as the postgres.js driver's that the app uses.
  return db as unknown as Database;
}

const profile = { authUserId: "8b0f6c1e-3d7a-4f7e-9a51-2f3c4d5e6f70", email: "ada@example.com" };

describe("user profiles", () => {
  it("sets and clears the display name", async () => {
    const db = await database();
    const id = await ensureUserId(db, profile);
    expect(await getDisplayName(db, id)).toBeNull();

    await setDisplayName(db, id, "Ada Lovelace");
    expect(await getDisplayName(db, id)).toBe("Ada Lovelace");
    await setDisplayName(db, id, null);
    expect(await getDisplayName(db, id)).toBeNull();
  }, 30_000);

  it("gives a user's first requests at once the same row", async () => {
    const db = await database();
    const ids = await Promise.all([1, 2, 3, 4].map(() => ensureUserId(db, profile)));
    expect(new Set(ids).size).toBe(1);
    const synced = await Promise.all([1, 2].map(() => upsertUserProfile(db, profile)));
    expect(synced).toEqual([ids[0], ids[0]]);
  }, 30_000);

  it("reads the row of a user's first request that inserted it at once with this one", async () => {
    const db = await database();
    const id = await ensureUserId(db, profile);
    // PGlite runs one statement at a time, so two inserts never race here. This stands in for
    // the one that lost: the other request's row is in, and the email's unique index stopped it.
    const lost = Object.assign(new Error("duplicate key value violates unique constraint"), {
      code: "23505",
    });
    const racing: Database = Object.create(db, {
      insert: {
        value: () => {
          throw lost;
        },
      },
    });
    expect(await upsertUserProfile(racing, profile)).toBe(id);
    await expect(
      upsertUserProfile(racing, { ...profile, email: "grace@example.com" }),
    ).rejects.toBe(lost);
  }, 30_000);

  it("leaves an email address another user's row has to that row", async () => {
    const db = await database();
    const id = await ensureUserId(db, profile);
    await ensureUserId(db, { authUserId: "another-user", email: "grace@example.com" });
    await expect(
      upsertUserProfile(db, { ...profile, email: "grace@example.com" }),
    ).rejects.toMatchObject({ cause: { code: "23505" } });
    expect(await upsertUserProfile(db, profile)).toBe(id);
  }, 30_000);

  it("says so when another user's row has the email address, which is unique", async () => {
    const db = await database();
    await ensureUserId(db, profile);
    await expect(ensureUserId(db, { ...profile, authUserId: "another-user" })).rejects.toThrow(
      "Another users row has this user's email address, so it can't have one of its own.",
    );
  }, 30_000);

  it("deletes a profile by its identity-provider user", async () => {
    const db = await database();
    const id = await ensureUserId(db, profile);
    await deleteUserProfile(db, profile.authUserId);
    expect(await getDisplayName(db, id)).toBeNull();
    // A new profile is created on next use.
    expect(await ensureUserId(db, profile)).not.toBe(id);
  }, 30_000);
});

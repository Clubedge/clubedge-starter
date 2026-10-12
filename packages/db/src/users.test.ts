import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Database } from "./client";
import { deleteUserProfile, ensureUserId, getDisplayName, setDisplayName } from "./users";

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

  it("deletes a profile by its identity-provider user", async () => {
    const db = await database();
    const id = await ensureUserId(db, profile);
    await deleteUserProfile(db, profile.authUserId);
    expect(await getDisplayName(db, id)).toBeNull();
    // A new profile is created on next use.
    expect(await ensureUserId(db, profile)).not.toBe(id);
  }, 30_000);
});

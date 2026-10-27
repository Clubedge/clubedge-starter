import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { users, type Database } from "@clubedge/db";
import { createPushDevices, sendToUser } from "./devices";
import { isPushToken, type PushProvider } from "./types";

const folder = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/** A PostgreSQL (PGlite) with the app's and the push migrations applied. */
async function database() {
  const client = await PGlite.create();
  const db = drizzle({ client });
  await migrate(db, { migrationsFolder: folder("../../db/drizzle") });
  await migrate(db, {
    migrationsFolder: folder("../drizzle"),
    migrationsTable: "__drizzle_migrations_push",
  });
  // The query builder is the same as the postgres.js driver's that the app uses.
  return { client, db: db as unknown as Database };
}

const expoToken = (id: string) => `ExponentPushToken[${id}]`;
const apnsToken = "a".repeat(64);

let client: PGlite;
let db: Database;
let devices: ReturnType<typeof createPushDevices>;
let ada: string;
let grace: string;

beforeAll(async () => {
  ({ client, db } = await database());
  devices = createPushDevices(db);
});

afterAll(async () => {
  await client.close();
});

beforeEach(async () => {
  await client.exec('truncate "users" cascade');
  const rows = await db
    .insert(users)
    .values([{ email: "ada@example.com" }, { email: "grace@example.com" }])
    .returning({ id: users.id });
  [ada, grace] = rows.map(({ id }) => id) as [string, string];
});

describe("push devices", () => {
  it("keeps each user's tokens, and forgets one on request", async () => {
    await devices.register(ada, { token: expoToken("phone"), service: "expo", platform: "ios" });
    await devices.register(ada, { token: expoToken("tablet"), service: "expo", platform: "android" });
    await devices.register(grace, { token: apnsToken, service: "apns", platform: "ios" });

    expect(await devices.forUser(ada)).toEqual([
      { token: expoToken("phone"), service: "expo", platform: "ios" },
      { token: expoToken("tablet"), service: "expo", platform: "android" },
    ]);
    await devices.remove(expoToken("phone"));
    expect((await devices.forUser(ada)).map(({ token }) => token)).toEqual([expoToken("tablet")]);
    expect(await devices.forUser(grace)).toHaveLength(1);
  });

  it("moves a token to whoever signs in on that device next", async () => {
    await devices.register(ada, { token: expoToken("shared"), service: "expo", platform: "ios" });
    await devices.register(grace, { token: expoToken("shared"), service: "expo", platform: "ios" });
    expect(await devices.forUser(ada)).toEqual([]);
    expect(await devices.forUser(grace)).toHaveLength(1);
  });

  it("goes with its user", async () => {
    await devices.register(ada, { token: expoToken("phone"), service: "expo", platform: "ios" });
    await client.exec(`delete from "users" where "id" = '${ada}'`);
    expect(await devices.forUser(ada)).toEqual([]);
  });
});

describe("sendToUser", () => {
  const provider = (invalidTokens: string[] = []): PushProvider => ({
    id: "fake",
    services: ["expo"],
    send: vi.fn(async (list) => ({ sent: list.length - invalidTokens.length, invalidTokens })),
  });
  const message = { title: "Hello", body: "From the test", data: { url: "/" } };

  it("sends to the devices the provider reaches, and forgets the tokens it refuses for good", async () => {
    await devices.register(ada, { token: expoToken("phone"), service: "expo", platform: "ios" });
    await devices.register(ada, { token: expoToken("old"), service: "expo", platform: "android" });
    await devices.register(ada, { token: apnsToken, service: "apns", platform: "ios" });
    const expo = provider([expoToken("old")]);

    expect(await sendToUser(devices, expo, ada, message)).toEqual({ sent: 1, invalidTokens: [expoToken("old")] });
    // The APNs token is another provider's to reach: it is neither sent to nor removed.
    expect(vi.mocked(expo.send).mock.calls[0]![0].map(({ token }) => token)).toEqual([
      expoToken("phone"),
      expoToken("old"),
    ]);
    expect((await devices.forUser(ada)).map(({ token }) => token)).toEqual([expoToken("phone"), apnsToken]);
  });

  it("sends nothing to a user without a device it reaches", async () => {
    const expo = provider();
    expect(await sendToUser(devices, expo, grace, message)).toEqual({ sent: 0, invalidTokens: [] });
    expect(expo.send).not.toHaveBeenCalled();
  });
});

describe("isPushToken", () => {
  it.each([
    ["expo", "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]", true],
    ["expo", "ExpoPushToken[xxxxxxxxxxxxxxxxxxxxxx]", true],
    ["expo", "xxxxxxxxxxxxxxxxxxxxxx", false],
    ["fcm", "dGVzdA:APA91bH-x_y.z", true],
    ["fcm", "has space", false],
    ["apns", apnsToken, true],
    ["apns", "not-hex", false],
  ] as const)("knows a %s token from %s", (service, token, valid) => {
    expect(isPushToken(service, token)).toBe(valid);
  });
});

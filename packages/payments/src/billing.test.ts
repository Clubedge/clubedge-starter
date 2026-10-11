import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { users, type Database } from "@clubedge/db";
import { createBilling, isEntitled, NoBillingAccountError } from "./billing";
import { subscriptions } from "./schema";
import type { PaymentEvent, PaymentProvider, SubscriptionSnapshot } from "./types";

const folder = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/** A fresh PostgreSQL (PGlite) with the app's and the payment migrations applied. */
async function database() {
  const client = await PGlite.create();
  const db = drizzle({ client });
  await migrate(db, { migrationsFolder: folder("../../db/drizzle") });
  await migrate(db, {
    migrationsFolder: folder("../drizzle"),
    migrationsTable: "__drizzle_migrations_payments",
  });
  // The query builder is the same as the postgres.js driver's that the app uses.
  return db as unknown as Database;
}

/** A provider whose next webhook event the test chooses. */
function fakeProvider() {
  let next: PaymentEvent = { id: "evt_ignored", type: "ignored" };
  const provider: PaymentProvider = {
    id: "fake",
    createCheckout: vi.fn(async () => ({ url: "https://pay.example/checkout" })),
    createPortal: vi.fn(async () => ({ url: "https://pay.example/portal" })),
    parseWebhook: vi.fn(async () => next),
  };
  return { provider, send: (event: PaymentEvent) => (next = event) };
}

const snapshot = (
  userId: string | null,
  changes: Partial<SubscriptionSnapshot> = {},
): SubscriptionSnapshot => ({
  provider: "fake",
  customerId: "cus_1",
  subscriptionId: "sub_1",
  userId,
  planId: "pro",
  status: "active",
  currentPeriodEnd: new Date("2030-01-01T00:00:00Z"),
  cancelAtPeriodEnd: false,
  ...changes,
});

const request = { body: "{}", headers: new Headers() };

describe("createBilling", () => {
  let db: Database;
  let userId: string;

  beforeEach(async () => {
    db = await database();
    const [user] = await db
      .insert(users)
      .values({ email: "ada@example.com" })
      .returning({ id: users.id });
    userId = user!.id;
  });

  it("applies subscription events, and each event only once", async () => {
    const { provider, send } = fakeProvider();
    const billing = createBilling({ db, provider });

    send({ id: "evt_1", type: "subscription.updated", subscription: snapshot(userId) });
    expect(await billing.handleWebhook(request)).toBe("applied");
    expect(await billing.subscriptionFor(userId)).toMatchObject({
      planId: "pro",
      status: "active",
      provider: "fake",
    });
    expect(await billing.handleWebhook(request)).toBe("duplicate");

    // Later events update the same row, even when they do not carry the user id.
    send({
      id: "evt_2",
      type: "subscription.updated",
      subscription: snapshot(null, { status: "past_due", cancelAtPeriodEnd: true }),
    });
    expect(await billing.handleWebhook(request)).toBe("applied");
    expect(await billing.subscriptionFor(userId)).toMatchObject({
      status: "past_due",
      cancelAtPeriodEnd: true,
    });
    expect(await db.select().from(subscriptions)).toHaveLength(1);
  });

  it("ignores events it does not need, and subscriptions it cannot attach to a user", async () => {
    const { provider, send } = fakeProvider();
    const billing = createBilling({ db, provider });
    expect(await billing.handleWebhook(request)).toBe("ignored");

    send({
      id: "evt_3",
      type: "subscription.updated",
      subscription: snapshot(null, { subscriptionId: "sub_unknown" }),
    });
    expect(await billing.handleWebhook(request)).toBe("ignored");
    expect(await db.select().from(subscriptions)).toHaveLength(0);
  });

  it("reuses the customer for a new checkout and opens the portal only for customers", async () => {
    const { provider, send } = fakeProvider();
    const billing = createBilling({ db, provider });
    const checkout = {
      user: { id: userId, email: "ada@example.com" },
      planId: "pro",
      successUrl: "https://app.example/dashboard?billing=success",
      cancelUrl: "https://app.example/dashboard",
    };

    await billing.checkout(checkout);
    expect(provider.createCheckout).toHaveBeenLastCalledWith(
      expect.objectContaining({ customerId: undefined, userId }),
    );
    await expect(
      billing.portal({ userId, returnUrl: "https://app.example/dashboard" }),
    ).rejects.toThrow(NoBillingAccountError);

    send({ id: "evt_4", type: "subscription.updated", subscription: snapshot(userId) });
    await billing.handleWebhook(request);
    await billing.checkout(checkout);
    expect(provider.createCheckout).toHaveBeenLastCalledWith(
      expect.objectContaining({ customerId: "cus_1" }),
    );
    expect(await billing.portal({ userId, returnUrl: "https://app.example/dashboard" })).toEqual({
      url: "https://pay.example/portal",
    });
    expect(provider.createPortal).toHaveBeenCalledWith({
      customerId: "cus_1",
      returnUrl: "https://app.example/dashboard",
    });
  });
});

describe("isEntitled", () => {
  it("grants access while active or trialing", () => {
    expect(isEntitled({ status: "active" })).toBe(true);
    expect(isEntitled({ status: "trialing" })).toBe(true);
    expect(isEntitled({ status: "past_due" })).toBe(false);
    expect(isEntitled({ status: "canceled" })).toBe(false);
    expect(isEntitled(null)).toBe(false);
  });
});

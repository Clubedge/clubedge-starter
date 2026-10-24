import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { User } from "@clubedge/contract";
import { setTelemetry } from "@clubedge/core";
import {
  NoBillingAccountError,
  WebhookVerificationError,
  type Billing,
  type Subscription,
} from "@clubedge/payments";
import { createApp } from "@/app";
import type { BillingDependencies } from "@/routes/billing";

// Errors the routes report, instead of the server log.
const reported: unknown[] = [];

beforeAll(() =>
  setTelemetry({ reportError: (error) => reported.push(error), traced: (_name, run) => run() }),
);
afterAll(() => setTelemetry(null));

const user: User = { id: "auth-user-1", email: "ada@example.com", displayName: null };

/** A stand-in for Billing that records what the routes asked of it. */
function fakeBilling() {
  const calls: { checkout?: unknown; portal?: unknown; webhook?: string } = {};
  let subscription: Subscription | null = null;
  const billing: Billing = {
    subscriptionFor: async () => subscription,
    checkout: async (input) => {
      calls.checkout = input;
      return { url: "https://checkout.example/session" };
    },
    portal: async (input) => {
      calls.portal = input;
      if (!subscription) throw new NoBillingAccountError("No billing account.");
      return { url: "https://billing.example/portal" };
    },
    handleWebhook: async ({ body, headers }) => {
      if (headers.get("stripe-signature") !== "valid") throw new WebhookVerificationError("no");
      calls.webhook = body;
      if (body === "boom") throw new Error("database down");
      return "applied";
    },
  };
  const subscribe = (row: Partial<Subscription>) => {
    subscription = {
      id: "row-1",
      userId: "profile-1",
      provider: "stripe",
      providerCustomerId: "cus_1",
      providerSubscriptionId: "sub_1",
      planId: "pro",
      status: "active",
      currentPeriodEnd: new Date("2030-01-01T00:00:00Z"),
      cancelAtPeriodEnd: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...row,
    };
  };
  return { billing, calls, subscribe };
}

function setup({ signedIn = true, configured = true } = {}) {
  const fake = fakeBilling();
  const payments: BillingDependencies = {
    isPaymentsConfigured: () => configured,
    getBilling: () => fake.billing,
    getUserProfileId: async () => "profile-1",
    appUrl: (path) => new URL(path, "https://app.example.com").toString(),
  };
  const app = createApp({
    serviceId: "my-product",
    isReady: async () => true,
    getCurrentUser: async () => (signedIn ? user : null),
    payments,
  });
  const post = (path: string, body: string, headers: Record<string, string> = {}) =>
    app.request(path, {
      method: "POST",
      body,
      headers: { "content-type": "application/json", ...headers },
    });
  return { app, post, ...fake };
}

describe("GET /api/billing", () => {
  it("lists the plans and the signed-in user's subscription", async () => {
    const { app, subscribe } = setup();
    subscribe({ status: "past_due", cancelAtPeriodEnd: true });
    const response = await app.request("/api/billing");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      configured: true,
      plans: [{ id: "pro", name: "Pro", description: expect.any(String) }],
      subscription: {
        planId: "pro",
        status: "past_due",
        currentPeriodEnd: "2030-01-01T00:00:00.000Z",
        cancelAtPeriodEnd: true,
        entitled: false,
      },
    });
  });

  it("has no subscription while payments are not configured", async () => {
    const { app, subscribe } = setup({ configured: false });
    subscribe({});
    expect(await (await app.request("/api/billing")).json()).toMatchObject({
      configured: false,
      subscription: null,
    });
  });
});

describe("POST /api/billing/checkout", () => {
  it("starts checkout for the user's profile, coming back to the frontend", async () => {
    const { post, calls } = setup();
    const response = await post("/api/billing/checkout", JSON.stringify({ planId: "pro" }));
    expect(await response.json()).toEqual({ url: "https://checkout.example/session" });
    expect(calls.checkout).toEqual({
      user: { id: "profile-1", email: "ada@example.com" },
      planId: "pro",
      successUrl: "https://app.example.com/dashboard?billing=success",
      cancelUrl: "https://app.example.com/dashboard",
    });
  });

  it("refuses an unknown plan", async () => {
    const { post } = setup();
    const response = await post("/api/billing/checkout", JSON.stringify({ planId: "gold" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "invalid_plan" } });
  });

  it("needs a signed-in user", async () => {
    const { post } = setup({ signedIn: false });
    expect((await post("/api/billing/checkout", '{"planId":"pro"}')).status).toBe(401);
  });

  it("takes only JSON, which another site cannot make a browser send", async () => {
    const { post } = setup();
    const response = await post("/api/billing/checkout", "planId=pro", {
      "content-type": "application/x-www-form-urlencoded",
    });
    expect(response.status).toBe(415);
  });
});

describe("POST /api/billing/portal", () => {
  it("opens the portal for a user who subscribed", async () => {
    const { post, subscribe, calls } = setup();
    subscribe({});
    expect(await (await post("/api/billing/portal", "{}")).json()).toEqual({
      url: "https://billing.example/portal",
    });
    expect(calls.portal).toEqual({
      userId: "profile-1",
      returnUrl: "https://app.example.com/dashboard",
    });
  });

  it("answers 409 for a user without a billing account", async () => {
    const { post } = setup();
    const response = await post("/api/billing/portal", "{}");
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "no_billing_account" } });
  });
});

describe("POST /api/webhooks/payments", () => {
  it("applies a signed event from its raw body, whatever its content type", async () => {
    const { post, calls } = setup();
    const body = '{ "id": "evt_1" }';
    const response = await post("/api/webhooks/payments", body, {
      "content-type": "text/plain",
      "stripe-signature": "valid",
    });
    expect(await response.json()).toEqual({ received: true, result: "applied" });
    expect(calls.webhook).toBe(body);
  });

  it("refuses an unsigned event", async () => {
    const { post } = setup();
    const response = await post("/api/webhooks/payments", "{}");
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "invalid_signature" } });
  });

  it("answers 500 when the event cannot be applied, so the provider retries", async () => {
    const { post } = setup();
    const response = await post("/api/webhooks/payments", "boom", { "stripe-signature": "valid" });
    expect(response.status).toBe(500);
    expect(reported.at(-1)).toMatchObject({ message: "database down" });
  });

  it("refuses a body over 1 MiB", async () => {
    const { post } = setup();
    const body = "x".repeat(1_048_577);
    const response = await post("/api/webhooks/payments", body, { "stripe-signature": "valid" });
    expect(response.status).toBe(413);
  });

  it("answers 503 while payments are not configured", async () => {
    const { post } = setup({ configured: false });
    expect((await post("/api/webhooks/payments", "{}")).status).toBe(503);
  });
});

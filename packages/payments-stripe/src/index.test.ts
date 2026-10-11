import Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WebhookVerificationError } from "@clubedge/payments";
import { createStripePayments } from "./index";

const webhookSecret = "whsec_test_secret";
let stripe: Stripe;

beforeEach(() => {
  // A real client; the API calls each test needs are stubbed, so nothing reaches Stripe.
  stripe = new Stripe("sk_test_dummy");
});

const provider = () =>
  createStripePayments({
    secretKey: "sk_test_dummy",
    webhookSecret,
    prices: { pro: "price_pro" },
    client: stripe,
  });

/** A webhook request signed like Stripe signs it. */
async function signed(event: object, secret = webhookSecret) {
  const body = JSON.stringify(event);
  const signature = await stripe.webhooks.generateTestHeaderStringAsync({ payload: body, secret });
  return { body, headers: new Headers({ "stripe-signature": signature }) };
}

const subscription = (changes: Record<string, unknown> = {}) =>
  ({
    id: "sub_1",
    object: "subscription",
    customer: "cus_1",
    status: "active",
    cancel_at_period_end: false,
    metadata: { userId: "user-1" },
    items: { data: [{ price: { id: "price_pro" }, current_period_end: 1_893_456_000 }] },
    ...changes,
  }) as unknown as Stripe.Response<Stripe.Subscription>;

describe("createStripePayments", () => {
  it("creates subscription checkouts that carry the user id, reusing customers", async () => {
    const create = vi.spyOn(stripe.checkout.sessions, "create").mockResolvedValue({
      url: "https://checkout.stripe.com/c/1",
    } as Stripe.Response<Stripe.Checkout.Session>);
    const checkout = {
      userId: "user-1",
      email: "ada@example.com",
      planId: "pro",
      successUrl: "https://app.example/dashboard?billing=success",
      cancelUrl: "https://app.example/dashboard",
    };

    expect(await provider().createCheckout(checkout)).toEqual({
      url: "https://checkout.stripe.com/c/1",
    });
    expect(create).toHaveBeenLastCalledWith({
      mode: "subscription",
      line_items: [{ price: "price_pro", quantity: 1 }],
      success_url: checkout.successUrl,
      cancel_url: checkout.cancelUrl,
      client_reference_id: "user-1",
      customer_email: "ada@example.com",
      subscription_data: { metadata: { userId: "user-1" } },
    });

    await provider().createCheckout({ ...checkout, customerId: "cus_1" });
    expect(create.mock.lastCall?.[0]).toMatchObject({ customer: "cus_1" });
    expect(create.mock.lastCall?.[0]).not.toHaveProperty("customer_email");

    await expect(provider().createCheckout({ ...checkout, planId: "enterprise" })).rejects.toThrow(
      'No Stripe price is configured for the plan "enterprise"',
    );
  });

  it("opens the customer portal", async () => {
    vi.spyOn(stripe.billingPortal.sessions, "create").mockResolvedValue({
      url: "https://billing.stripe.com/p/1",
    } as Stripe.Response<Stripe.BillingPortal.Session>);
    expect(
      await provider().createPortal({
        customerId: "cus_1",
        returnUrl: "https://app.example/dashboard",
      }),
    ).toEqual({
      url: "https://billing.stripe.com/p/1",
    });
  });

  it("refuses webhooks without a valid Stripe signature", async () => {
    const event = {
      id: "evt_1",
      type: "customer.subscription.updated",
      data: { object: subscription() },
    };
    await expect(
      provider().parseWebhook({ body: JSON.stringify(event), headers: new Headers() }),
    ).rejects.toThrow(WebhookVerificationError);
    await expect(
      provider().parseWebhook(await signed(event, "whsec_someone_else")),
    ).rejects.toThrow(WebhookVerificationError);
  });

  it("normalizes subscription events from the subscription's current state", async () => {
    // The event's copy is stale; the adapter reads the current subscription.
    const retrieve = vi
      .spyOn(stripe.subscriptions, "retrieve")
      .mockResolvedValue(subscription({ status: "past_due", cancel_at_period_end: true }));
    const event = {
      id: "evt_2",
      type: "customer.subscription.updated",
      data: { object: subscription() },
    };

    expect(await provider().parseWebhook(await signed(event))).toEqual({
      id: "evt_2",
      type: "subscription.updated",
      subscription: {
        provider: "stripe",
        customerId: "cus_1",
        subscriptionId: "sub_1",
        userId: "user-1",
        planId: "pro",
        status: "past_due",
        currentPeriodEnd: new Date(1_893_456_000 * 1000),
        cancelAtPeriodEnd: true,
      },
    });
    expect(retrieve).toHaveBeenCalledWith("sub_1");
  });

  it("follows completed checkouts to their subscription, and ignores other events", async () => {
    vi.spyOn(stripe.subscriptions, "retrieve").mockResolvedValue(
      subscription({
        items: { data: [{ price: { id: "price_unknown" }, current_period_end: null }] },
      }),
    );
    const completed = await provider().parseWebhook(
      await signed({
        id: "evt_3",
        type: "checkout.session.completed",
        data: { object: { subscription: "sub_1" } },
      }),
    );
    expect(completed).toMatchObject({
      type: "subscription.updated",
      subscription: { planId: null, currentPeriodEnd: null },
    });

    expect(
      await provider().parseWebhook(
        await signed({ id: "evt_4", type: "invoice.paid", data: { object: {} } }),
      ),
    ).toEqual({ id: "evt_4", type: "ignored" });
  });
});

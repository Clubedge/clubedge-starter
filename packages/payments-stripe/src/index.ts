import Stripe from "stripe";
import {
  WebhookVerificationError,
  type PaymentProvider,
  type SubscriptionSnapshot,
  type SubscriptionStatus,
} from "@clubedge/payments";

export interface StripePaymentsConfig {
  secretKey: string;
  /** The signing secret of the webhook endpoint (whsec_...). */
  webhookSecret: string;
  /** The app's plan ids mapped to Stripe price ids, such as { pro: "price_..." }. */
  prices: Record<string, string>;
  /** For tests: a client to use instead of one created from the secret key. */
  client?: Stripe;
}

const SUBSCRIPTION_EVENTS = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
]);

const STATUSES: Record<Stripe.Subscription.Status, SubscriptionStatus> = {
  active: "active",
  trialing: "trialing",
  past_due: "past_due",
  unpaid: "unpaid",
  paused: "paused",
  incomplete: "incomplete",
  incomplete_expired: "incomplete_expired",
  canceled: "canceled",
};

const idOf = (value: string | { id: string } | null) =>
  typeof value === "string" ? value : (value?.id ?? null);

/** Stripe Checkout, the customer portal, and verified webhooks behind PaymentProvider. */
export function createStripePayments({
  secretKey,
  webhookSecret,
  prices,
  client,
}: StripePaymentsConfig): PaymentProvider {
  const stripe = client ?? new Stripe(secretKey);
  const plansByPrice = new Map(Object.entries(prices).map(([plan, price]) => [price, plan]));

  function snapshot(subscription: Stripe.Subscription): SubscriptionSnapshot {
    const item = subscription.items.data[0];
    const periodEnd = item?.current_period_end;
    return {
      provider: "stripe",
      customerId: idOf(subscription.customer)!,
      subscriptionId: subscription.id,
      userId: subscription.metadata?.userId || null,
      planId: (item && plansByPrice.get(item.price.id)) ?? null,
      status: STATUSES[subscription.status] ?? "incomplete",
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    };
  }

  return {
    id: "stripe",

    async createCheckout({ userId, email, planId, successUrl, cancelUrl, customerId }) {
      const price = prices[planId];
      if (!price) throw new Error(`No Stripe price is configured for the plan "${planId}".`);
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        client_reference_id: userId,
        ...(customerId ? { customer: customerId } : { customer_email: email }),
        // Every subscription event carries the app's user id from here on.
        subscription_data: { metadata: { userId } },
      });
      if (!session.url) throw new Error("Stripe did not return a Checkout URL.");
      return { url: session.url };
    },

    async createPortal({ customerId, returnUrl }) {
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });
      return { url: session.url };
    },

    async parseWebhook({ body, headers }) {
      const signature = headers.get("stripe-signature");
      if (!signature) throw new WebhookVerificationError("The request has no Stripe signature.");
      let event: Stripe.Event;
      try {
        event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
      } catch (error) {
        throw new WebhookVerificationError(
          error instanceof Error ? error.message : "Invalid Stripe signature.",
        );
      }

      let subscriptionId: string | null = null;
      if (SUBSCRIPTION_EVENTS.has(event.type)) {
        subscriptionId = (event.data.object as Stripe.Subscription).id;
      } else if (event.type === "checkout.session.completed") {
        subscriptionId = idOf((event.data.object as Stripe.Checkout.Session).subscription);
      }
      if (!subscriptionId) return { id: event.id, type: "ignored" };

      // Events can arrive out of order, so read the subscription's current state from Stripe
      // rather than trusting the event's copy.
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      return { id: event.id, type: "subscription.updated", subscription: snapshot(subscription) };
    },
  };
}

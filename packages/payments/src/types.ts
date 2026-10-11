// The provider-neutral contract. Each provider package (Stripe today) implements PaymentProvider
// and translates its own events into PaymentEvent, so billing logic, tables, routes, and pages
// never depend on one provider.

/** Subscription states, using the vocabulary most providers share. */
export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "unpaid"
  | "paused"
  | "incomplete"
  | "incomplete_expired"
  | "canceled";

/** A subscription as the provider reports it now. */
export interface SubscriptionSnapshot {
  /** The provider's id, such as "stripe". */
  provider: string;
  customerId: string;
  subscriptionId: string;
  /** The app's user id, carried through checkout; null when the provider did not return it. */
  userId: string | null;
  /** The app's plan id; null when the provider's price matches no configured plan. */
  planId: string | null;
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

/** A verified webhook event, normalized. Events billing does not need are "ignored". */
export type PaymentEvent =
  | { id: string; type: "subscription.updated"; subscription: SubscriptionSnapshot }
  | { id: string; type: "ignored" };

export interface CheckoutInput {
  /** The app's user id (users.id), returned with the subscription's events. */
  userId: string;
  email: string;
  planId: string;
  successUrl: string;
  cancelUrl: string;
  /** The provider's customer id from an earlier subscription, so the customer is reused. */
  customerId?: string;
}

/** Application code depends on this interface, never on a provider SDK. */
export interface PaymentProvider {
  /** Stored with each subscription, such as "stripe". */
  readonly id: string;
  /** Starts a hosted checkout for a plan and returns where to send the user. */
  createCheckout(input: CheckoutInput): Promise<{ url: string }>;
  /** Opens the provider's hosted billing management for a customer. */
  createPortal(input: { customerId: string; returnUrl: string }): Promise<{ url: string }>;
  /**
   * Verifies a webhook request's signature and returns its normalized event. Throws
   * WebhookVerificationError when the request did not come from the provider.
   */
  parseWebhook(input: { body: string; headers: Headers }): Promise<PaymentEvent>;
}

export class WebhookVerificationError extends Error {
  override name = "WebhookVerificationError";
}

/** Statuses that grant access to the paid features. */
export const ENTITLED_STATUSES: readonly SubscriptionStatus[] = ["active", "trialing"];

import { and, desc, eq } from "drizzle-orm";
import type { Database } from "@clubedge/db";
import { paymentEvents, subscriptions, type Subscription } from "./schema";
import { ENTITLED_STATUSES, type PaymentProvider, type SubscriptionStatus } from "./types";

export class NoBillingAccountError extends Error {
  override name = "NoBillingAccountError";
}

export type WebhookResult = "applied" | "ignored" | "duplicate";

/** Whether a subscription grants access to paid features. */
export function isEntitled(subscription: Pick<Subscription, "status"> | null): boolean {
  return Boolean(
    subscription && ENTITLED_STATUSES.includes(subscription.status as SubscriptionStatus),
  );
}

/**
 * The user's most recently updated subscription with any provider, or null. Reads only the
 * database, so it works even while the payment provider is not configured.
 */
export async function findSubscription(db: Database, userId: string): Promise<Subscription | null> {
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .orderBy(desc(subscriptions.updatedAt))
    .limit(1);
  return row ?? null;
}

/**
 * Billing for one provider: checkout and portal sessions, the current subscription, and webhook
 * handling. Provider-neutral: it only uses PaymentProvider and the subscription tables.
 */
export function createBilling({ db, provider }: { db: Database; provider: PaymentProvider }) {
  const subscriptionFor = (userId: string) => findSubscription(db, userId);

  /** The provider customer id from the user's earlier subscriptions with this provider. */
  async function customerIdFor(userId: string): Promise<string | undefined> {
    const [row] = await db
      .select({ customerId: subscriptions.providerCustomerId })
      .from(subscriptions)
      .where(and(eq(subscriptions.userId, userId), eq(subscriptions.provider, provider.id)))
      .orderBy(desc(subscriptions.updatedAt))
      .limit(1);
    return row?.customerId;
  }

  return {
    subscriptionFor,

    async checkout(input: {
      user: { id: string; email: string };
      planId: string;
      successUrl: string;
      cancelUrl: string;
    }) {
      return provider.createCheckout({
        userId: input.user.id,
        email: input.user.email,
        planId: input.planId,
        successUrl: input.successUrl,
        cancelUrl: input.cancelUrl,
        customerId: await customerIdFor(input.user.id),
      });
    },

    /** Throws NoBillingAccountError when the user never subscribed with this provider. */
    async portal(input: { userId: string; returnUrl: string }) {
      const customerId = await customerIdFor(input.userId);
      if (!customerId) throw new NoBillingAccountError("This user has no billing account yet.");
      return provider.createPortal({ customerId, returnUrl: input.returnUrl });
    },

    /**
     * Verifies and applies a webhook. Each event is applied once: a redelivered event returns
     * "duplicate". Throws WebhookVerificationError for requests the provider did not sign.
     */
    async handleWebhook(request: { body: string; headers: Headers }): Promise<WebhookResult> {
      const event = await provider.parseWebhook(request);
      if (event.type === "ignored") return "ignored";

      return db.transaction(async (tx) => {
        const recorded = await tx
          .insert(paymentEvents)
          .values({ provider: provider.id, eventId: event.id })
          .onConflictDoNothing()
          .returning({ eventId: paymentEvents.eventId });
        if (recorded.length === 0) return "duplicate";

        const snapshot = event.subscription;
        const values = {
          provider: snapshot.provider,
          providerCustomerId: snapshot.customerId,
          planId: snapshot.planId,
          status: snapshot.status,
          currentPeriodEnd: snapshot.currentPeriodEnd,
          cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
        };
        const [existing] = await tx
          .select({ id: subscriptions.id })
          .from(subscriptions)
          .where(
            and(
              eq(subscriptions.provider, snapshot.provider),
              eq(subscriptions.providerSubscriptionId, snapshot.subscriptionId),
            ),
          )
          .limit(1);
        if (existing) {
          await tx.update(subscriptions).set(values).where(eq(subscriptions.id, existing.id));
        } else if (snapshot.userId) {
          await tx.insert(subscriptions).values({
            ...values,
            userId: snapshot.userId,
            providerSubscriptionId: snapshot.subscriptionId,
          });
        } else {
          // Without the app's user id there is no row to attach the subscription to.
          return "ignored";
        }
        return "applied";
      });
    },
  };
}

export type Billing = ReturnType<typeof createBilling>;

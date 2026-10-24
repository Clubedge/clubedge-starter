// Billing: the plans and the user's subscription, checkout and the billing portal on the payment
// provider's hosted pages, and the provider's webhook, which records subscriptions.
import { Hono } from "hono";
import type {
  Billing as BillingStatus,
  BillingRedirect,
  Subscription,
  User,
  WebhookReceipt,
} from "@clubedge/contract";
import { reportError } from "@clubedge/core";
import {
  isEntitled,
  NoBillingAccountError,
  WebhookVerificationError,
  type Billing,
} from "@clubedge/payments";
import type { ApiDependencies } from "@/app";
import { plans } from "@/config/plans";
import { apiError, jsonOnly, limitBody } from "@/http";

/** What billing needs from the composition root (src/server/payments and src/server/users). */
export interface BillingDependencies {
  /** Whether checkout and webhooks can work: the provider's keys are set. */
  isPaymentsConfigured(): boolean;
  /** Billing with the provider; only called while payments are configured. */
  getBilling(): Billing;
  /** The app-owned users row id for a signed-in user. */
  getUserProfileId(user: Pick<User, "id" | "email">): Promise<string>;
  /** A page of the frontend, where the provider's pages send the user back. */
  appUrl(path: string): string;
}

const MAX_BODY = 16_384;
// Stripe's events are far smaller; the limit only stops a flood of bytes.
const MAX_WEBHOOK_BODY = 1_048_576;

const planList = plans.map(({ id, name, description }) => ({ id, name, description }));

const notConfigured = "Payments are not configured on this server.";

export function billingRoutes(dependencies: ApiDependencies) {
  const payments = dependencies.payments;
  const configured = (): BillingDependencies | null =>
    payments?.isPaymentsConfigured() ? payments : null;

  return (
    new Hono()
      .get("/api/billing", async (c) => {
        c.header("Cache-Control", "no-store");
        const billing = configured();
        const user = billing ? await dependencies.getCurrentUser(c.req.raw) : null;
        let subscription: Subscription | null = null;
        if (billing && user) {
          const row = await billing
            .getBilling()
            .subscriptionFor(await billing.getUserProfileId(user));
          subscription = row && {
            planId: row.planId,
            status: row.status as Subscription["status"],
            currentPeriodEnd: row.currentPeriodEnd?.toISOString() ?? null,
            cancelAtPeriodEnd: row.cancelAtPeriodEnd,
            entitled: isEntitled(row),
          };
        }
        return c.json<BillingStatus>({
          configured: billing !== null,
          plans: planList,
          subscription,
        });
      })
      .post("/api/billing/checkout", jsonOnly, limitBody(MAX_BODY), async (c) => {
        const billing = configured();
        if (!billing) return apiError(c, 503, "not_configured", notConfigured);
        const user = await dependencies.getCurrentUser(c.req.raw);
        if (!user) return apiError(c, 401, "unauthorized", "Sign in to choose a plan.");
        const body: unknown = await c.req.json().catch(() => null);
        const planId = (body as { planId?: unknown } | null)?.planId;
        const plan = plans.find((candidate) => candidate.id === planId);
        if (!plan) return apiError(c, 400, "invalid_plan", "There is no such plan.");
        const { url } = await billing.getBilling().checkout({
          user: { id: await billing.getUserProfileId(user), email: user.email },
          planId: plan.id,
          successUrl: billing.appUrl("/dashboard?billing=success"),
          cancelUrl: billing.appUrl("/dashboard"),
        });
        return c.json<BillingRedirect>({ url });
      })
      .post("/api/billing/portal", jsonOnly, limitBody(MAX_BODY), async (c) => {
        const billing = configured();
        if (!billing) return apiError(c, 503, "not_configured", notConfigured);
        const user = await dependencies.getCurrentUser(c.req.raw);
        if (!user) return apiError(c, 401, "unauthorized", "Sign in to manage billing.");
        try {
          const { url } = await billing.getBilling().portal({
            userId: await billing.getUserProfileId(user),
            returnUrl: billing.appUrl("/dashboard"),
          });
          return c.json<BillingRedirect>({ url });
        } catch (error) {
          if (error instanceof NoBillingAccountError) {
            return apiError(c, 409, "no_billing_account", "Subscribe to a plan first.");
          }
          throw error;
        }
      })
      // Signed by the provider rather than sent by a browser, so it takes the body as it comes.
      .post("/api/webhooks/payments", limitBody(MAX_WEBHOOK_BODY), async (c) => {
        const billing = configured();
        if (!billing) return apiError(c, 503, "not_configured", notConfigured);
        // Raw text, because the signature covers the exact bytes. Read outside the try: limitBody
        // answers 413 when the body outgrows its limit.
        const body = await c.req.text();
        try {
          const result = await billing.getBilling().handleWebhook({
            body,
            headers: c.req.raw.headers,
          });
          return c.json<WebhookReceipt>({ received: true, result });
        } catch (error) {
          if (error instanceof WebhookVerificationError) {
            return apiError(c, 400, "invalid_signature", "The webhook signature is not valid.");
          }
          // 500 makes the provider retry the event later.
          reportError(error, { message: "Payment webhook failed" });
          return apiError(c, 500, "webhook_failed", "The webhook could not be applied.");
        }
      })
  );
}

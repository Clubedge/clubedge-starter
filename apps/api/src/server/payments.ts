import { z } from "zod";
import { withSpans } from "@clubedge/core";
import { createBilling, type Billing } from "@clubedge/payments";
import { createStripePayments } from "@clubedge/payments-stripe";
import { plans } from "@/config/plans";
import { optional, parseEnv } from "@/env";
import { getDb } from "./db";

export {
  findSubscription,
  isEntitled,
  NoBillingAccountError,
  WebhookVerificationError,
} from "@clubedge/payments";

// Stripe behind the provider-neutral PaymentProvider; the rest of the API only uses Billing.
const paymentsEnvSchema = z.object({
  STRIPE_SECRET_KEY: optional(z.string()),
  STRIPE_WEBHOOK_SECRET: optional(z.string()),
  // For tests and stripe-mock: send API requests to another server.
  STRIPE_API_BASE: optional(z.url()),
});

/** Each plan's Stripe price, from STRIPE_PRICE_<PLAN>, such as STRIPE_PRICE_PRO. */
function prices(): Record<string, string> {
  return Object.fromEntries(
    plans.flatMap((plan) => {
      const price = process.env[`STRIPE_PRICE_${plan.id.toUpperCase().replace(/-/g, "_")}`];
      return price ? [[plan.id, price]] : [];
    }),
  );
}

function paymentsEnv() {
  const env = parseEnv(paymentsEnvSchema, "Payments");
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) return null;
  return { ...env, secretKey: env.STRIPE_SECRET_KEY, webhookSecret: env.STRIPE_WEBHOOK_SECRET };
}

/** Whether checkout and webhooks can work: the Stripe keys are set. */
export function isPaymentsConfigured(): boolean {
  return paymentsEnv() !== null;
}

/**
 * A page of the frontend, from FRONTEND_URL: checkout and the billing portal send the user back
 * there, since the API itself serves no pages.
 */
export function appUrl(path: string): string {
  return new URL(path, process.env.FRONTEND_URL || "http://localhost:3000").toString();
}

let billing: Billing | undefined;

/** One Billing per process. Throws while payments are not configured. */
export function getBilling(): Billing {
  if (billing) return billing;
  const env = paymentsEnv();
  if (!env)
    throw new Error(
      "Payments are not configured: set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.",
    );
  billing = withSpans(
    "payments",
    createBilling({
      db: getDb(),
      provider: createStripePayments({
        secretKey: env.secretKey,
        webhookSecret: env.webhookSecret,
        prices: prices(),
        apiBase: env.STRIPE_API_BASE,
      }),
    }),
  );
  return billing;
}

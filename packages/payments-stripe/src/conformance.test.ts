import Stripe from "stripe";
import { describePaymentProvider } from "@clubedge/payments/conformance";
import { createStripePayments } from "./index";

// Verifying signatures runs against the provider alone: any STRIPE_WEBHOOK_SECRET works, because
// the suite signs requests with the same secret. Normalizing a verified event additionally needs
// a server that speaks Stripe's API — stripe-mock, whose fixtures include sub_1234 — so point
// STRIPE_API_BASE at one (as CI does) to run that test too.
const secretKey = process.env.STRIPE_SECRET_KEY || "sk_test_conformance";
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "whsec_conformance";
const apiBase = process.env.STRIPE_API_BASE;

describePaymentProvider("stripe", () => {
  const signer = new Stripe(secretKey);
  return {
    provider: () =>
      createStripePayments({
        secretKey,
        webhookSecret,
        prices: { pro: process.env.STRIPE_PRICE_PRO || "price_conformance" },
        ...(apiBase ? { apiBase } : {}),
      }),
    sign: async (body) => ({
      "stripe-signature": await signer.webhooks.generateTestHeaderString({
        payload: body,
        secret: webhookSecret,
      }),
    }),
    apiReady: Boolean(apiBase),
  };
});

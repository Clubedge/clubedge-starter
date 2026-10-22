// The behaviour every PaymentProvider must have, as one test suite. A provider's tests call
// describePaymentProvider with a harness, so a new provider is proven by passing it rather than
// by review, and providers can't drift apart on verification, normalization, or checkout:
//
//   describePaymentProvider("stripe", () => ({ provider, sign, apiReady }));
//
// It runs in Vitest, which is why it is a separate entry (`@clubedge/payments/conformance`) that
// only tests import. Verifying signatures and refusing an unconfigured plan need the provider
// alone; turning a verified event into a subscription additionally needs a server that speaks
// the provider's API, which the harness announces with apiReady.
import { describe, expect, it } from "vitest";
import { WebhookVerificationError, type PaymentProvider } from "./index";

export interface PaymentsHarness {
  provider(): PaymentProvider | Promise<PaymentProvider>;
  /** Headers that sign `body` as the provider would sign a webhook request. */
  sign(body: string): Promise<Record<string, string>>;
  /** Whether a server speaks the provider's API, so a verified event can be normalized. */
  apiReady?: boolean;
}

export interface PaymentsConformanceOptions {
  /** Skip the whole suite, for example when the provider's server isn't available. */
  skip?: boolean | string;
  /** Per-test timeout in milliseconds, for providers behind a network round trip. Default 30s. */
  timeoutMs?: number;
}

const checkout = {
  userId: "user-conformance",
  email: "user-conformance@example.com",
  planId: "pro",
  successUrl: "http://localhost:3000/billing/success",
  cancelUrl: "http://localhost:3000/billing",
};

const invoiceBody = JSON.stringify({
  id: "evt_ignored",
  type: "invoice.paid",
  data: { object: {} },
});

export function describePaymentProvider(
  provider: string,
  setup: () => PaymentsHarness | Promise<PaymentsHarness>,
  options: PaymentsConformanceOptions = {},
) {
  const timeout = options.timeoutMs ?? 30_000;
  const suite = options.skip ? describe.skip : describe;
  const name = provider;

  suite(`PaymentProvider conformance: ${provider}`, () => {
    it(
      "refuses a checkout for a plan without a configured price",
      async () => {
        const provider = await (await setup()).provider();
        await expect(
          provider.createCheckout({ ...checkout, planId: "no-such-plan" }),
        ).rejects.toThrow(/plan/i);
      },
      timeout,
    );

    it(
      "ignores a signed event without a subscription",
      async () => {
        const harness = await setup();
        const provider = await harness.provider();
        const event = await provider.parseWebhook({
          body: invoiceBody,
          headers: new Headers(await harness.sign(invoiceBody)),
        });
        expect(event).toEqual({ id: "evt_ignored", type: "ignored" });
      },
      timeout,
    );

    it(
      "rejects requests it cannot verify",
      async () => {
        const harness = await setup();
        const provider = await harness.provider();

        await expect(
          provider.parseWebhook({ body: invoiceBody, headers: new Headers() }),
        ).rejects.toThrow(WebhookVerificationError);

        const other = JSON.stringify({ ...JSON.parse(invoiceBody), id: "evt_other" });
        await expect(
          provider.parseWebhook({
            body: invoiceBody,
            headers: new Headers(await harness.sign(other)),
          }),
        ).rejects.toThrow(WebhookVerificationError);

        await expect(
          provider.parseWebhook({
            body: invoiceBody,
            headers: new Headers({ "x-signature": "not-a-signature" }),
          }),
        ).rejects.toThrow(WebhookVerificationError);
      },
      timeout,
    );

    it(
      "normalizes a signed subscription event from the provider's API",
      async () => {
        const harness = await setup();
        if (!harness.apiReady) return;
        const provider = await harness.provider();
        const body = JSON.stringify({
          id: "evt_subscription",
          type: "customer.subscription.updated",
          data: { object: { id: "sub_1234" } },
        });

        const event = await provider.parseWebhook({
          body,
          headers: new Headers(await harness.sign(body)),
        });
        expect(event.type).toBe("subscription.updated");
        if (event.type !== "subscription.updated") return;

        const subscription = event.subscription;
        expect(subscription).toMatchObject({ provider: name, subscriptionId: "sub_1234" });
        expect(subscription.customerId).toBeTruthy();
        expect(subscription.planId === null || typeof subscription.planId === "string").toBe(true);
        expect(subscription.userId === null || typeof subscription.userId === "string").toBe(true);
        expect(
          subscription.currentPeriodEnd === null || subscription.currentPeriodEnd instanceof Date,
        ).toBe(true);
        expect(typeof subscription.cancelAtPeriodEnd).toBe("boolean");
      },
      timeout,
    );
  });
}

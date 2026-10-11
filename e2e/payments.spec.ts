import { expect, test } from "@playwright/test";
import { signedWebhook, startFakeStripe } from "./stripe-fake";

// Subscribes through checkout and the provider's webhook, then opens billing management. It
// needs payments configured against the fake Stripe API in ./stripe-fake.ts, so it runs only with
// E2E_PAYMENTS=1 (the Starter's CI sets STRIPE_API_BASE and the Stripe variables for it).
test.skip(!process.env.E2E_PAYMENTS, "needs payments configured against the fake Stripe API");

test("subscribes through checkout and the webhook, then opens the billing portal", async ({
  page,
}) => {
  const stripe = await startFakeStripe();
  try {
    await page.goto("/login?mode=signup");
    await page.getByLabel("Email").fill(`billing-${Date.now()}@example.com`);
    await page.getByLabel("Password", { exact: true }).fill("correct horse battery");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Upgrade to Pro" }).click();
    await expect(page).toHaveURL(/\/dashboard\?billing=success$/, { timeout: 20_000 });
    expect(stripe.checkout).toMatchObject({ price: process.env.STRIPE_PRICE_PRO, customer: null });
    expect(stripe.checkout?.userId).toMatch(/^[0-9a-f-]{36}$/);

    const event = {
      id: `evt_${Date.now()}`,
      type: "customer.subscription.created",
      data: { object: { id: "sub_e2e" } },
    };
    const delivered = await page.request.post("/api/webhooks/payments", signedWebhook(event));
    expect(await delivered.json()).toEqual({ received: true, result: "applied" });
    const redelivered = await page.request.post("/api/webhooks/payments", signedWebhook(event));
    expect(await redelivered.json()).toEqual({ received: true, result: "duplicate" });
    const forged = await page.request.post(
      "/api/webhooks/payments",
      signedWebhook(event, "whsec_someone_else"),
    );
    expect(forged.status()).toBe(400);

    await page.goto("/dashboard");
    const billing = page.locator("#billing");
    await expect(billing).toContainText("Pro");
    await expect(billing).toContainText("active");
    await page.waitForLoadState("networkidle");
    await billing.getByRole("button", { name: "Manage billing" }).click();
    await expect(page).toHaveURL(/\/dashboard\?billing=portal$/, { timeout: 20_000 });
  } finally {
    await stripe.stop();
  }
});

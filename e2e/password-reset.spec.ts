import { expect, test } from "@playwright/test";
import { emailedLink } from "./inbox";

// Resets a forgotten password through the emailed link. It needs an auth provider that sends
// email and a local inbox to read it from, so it runs only with E2E_MAIL_API set (the Starter's
// CI does this with Mailpit and with the Supabase stack's inbox).
test.skip(!process.env.E2E_MAIL_API, "needs an auth provider that sends email and E2E_MAIL_API");

test("resets a forgotten password through the emailed link", async ({ page }) => {
  const email = `reset-${Date.now()}@example.com`;

  await page.goto("/login?mode=signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("first password 1");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  // Let the page finish starting up first: a form posted while the router initializes can be
  // cancelled by its first navigation.
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  // Supabase sends its email during the request, and dev servers compile routes on first use.
  await expect(page).toHaveURL(/\/login\?notice=reset-sent$/, { timeout: 20_000 });
  await expect(page.getByRole("status")).toContainText("we sent it a link");

  await page.goto(await emailedLink(email, /reset/i));
  await expect(page).toHaveURL(/\/reset-password/);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("New password").fill("second password 2");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page).toHaveURL(/\/login\?notice=password-updated$/, { timeout: 20_000 });

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("first password 1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toContainText("could not be verified");

  // The failed attempt reloaded the login page, so fill in both fields again.
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("second password 2");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

import { expect, test } from "@playwright/test";
import { emailedLink } from "./inbox";

// With BETTER_AUTH_REQUIRE_EMAIL_VERIFICATION=true, sign-in waits for the emailed confirmation
// link. The Starter's CI runs it with E2E_EMAIL_VERIFICATION=1 and a Mailpit inbox.
test.skip(
  !process.env.E2E_EMAIL_VERIFICATION || !process.env.E2E_MAIL_API,
  "needs required email verification and E2E_MAIL_API",
);

test("signs in only after the emailed confirmation link", async ({ page }) => {
  const email = `verify-${Date.now()}@example.com`;
  const password = "correct horse battery";

  await page.goto("/login?mode=signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/check-email=1/);

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Confirm your email address first",
  );

  await page.goto(await emailedLink(email, /confirm/i));
  await expect(page).toHaveURL(/\/dashboard$/);
});

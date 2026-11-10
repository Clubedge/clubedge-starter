import { expect, test } from "@playwright/test";
import { emailedLink } from "./inbox";
import { uniqueEmail } from "./unique";

// With BETTER_AUTH_REQUIRE_EMAIL_VERIFICATION=true, sign-in waits for the emailed confirmation
// link. The Starter's CI runs it with E2E_EMAIL_VERIFICATION=1 and a Mailpit inbox.
test.skip(
  !process.env.E2E_EMAIL_VERIFICATION || !process.env.E2E_MAIL_API,
  "needs required email verification and E2E_MAIL_API",
);

test("signs in only after the emailed confirmation link", async ({ page }) => {
  const email = uniqueEmail("verify");
  const password = "correct horse battery";

  await page.goto("/login?mode=signup");
  // Let each page finish starting up before using it, and before leaving it: WebKit starts a
  // page over when one of its scripts is cut off, which cancels a form posted meanwhile and
  // undoes a navigation.
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/check-email=1/);

  await page.waitForLoadState("networkidle");
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Confirm your email address first",
  );

  await page.waitForLoadState("networkidle");
  await page.goto(await emailedLink(email, /confirm/i));
  await expect(page).toHaveURL(/\/dashboard$/);
});

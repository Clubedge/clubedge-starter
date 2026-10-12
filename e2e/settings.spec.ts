import { expect, test, type Page } from "@playwright/test";

// The settings page end to end: display name, password change, and account deletion. It needs
// an auth provider and a database, so it runs only with E2E_AUTH_FLOW=1 and E2E_DATABASE=1.
test.skip(
  !process.env.E2E_AUTH_FLOW || !process.env.E2E_DATABASE,
  "needs a configured auth provider and database",
);

// Several pages and form posts, each compiled by the dev server on first use.
test.describe.configure({ timeout: 90_000 });

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("updates the profile, changes the password, and deletes the account", async ({ page }) => {
  const email = `settings-${Date.now()}@example.com`;
  const password = "correct horse battery";
  const newPassword = "a brand new secret";

  await page.goto("/login?mode=signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.waitForLoadState("networkidle");

  // The dashboard links to the settings page.
  await page.getByRole("link", { name: "Settings" }).first().click();
  await expect(page).toHaveURL(/\/settings$/);
  await page.waitForLoadState("networkidle");

  await page.getByLabel("Display name").fill("Ada Lovelace");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("status")).toContainText("Your profile was saved.");
  await expect(page.getByLabel("Display name")).toHaveValue("Ada Lovelace");

  // A wrong current password changes nothing.
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Current password", { exact: true }).fill("not my password");
  await page.getByLabel("New password", { exact: true }).fill(newPassword);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "That password is not correct.",
  );

  await page.waitForLoadState("networkidle");
  await page.getByLabel("Current password", { exact: true }).fill(password);
  await page.getByLabel("New password", { exact: true }).fill(newPassword);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByRole("status")).toContainText("Your password was changed.");

  const deleteCard = page.locator("#delete-account");
  if ((await deleteCard.getByRole("button", { name: "Delete my account" }).count()) === 0) {
    // This provider cannot delete accounts here: check the new password instead.
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Sign out" }).first().click();
    await signIn(page, email, newPassword);
    await expect(page).toHaveURL(/\/dashboard$/);
    return;
  }

  await page.waitForLoadState("networkidle");
  await deleteCard.getByLabel("Password", { exact: true }).fill(newPassword);
  await deleteCard.getByRole("button", { name: "Delete my account" }).click();
  await expect(page).toHaveURL(/\/login\?notice=account-deleted$/);
  await expect(page.getByRole("status")).toContainText("Your account was deleted.");

  // The account is gone: its email and password no longer sign in.
  await signIn(page, email, newPassword);
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
});

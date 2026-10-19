import { expect, test } from "@playwright/test";

// CI sets this per generated auth provider. Better Auth and Firebase are configured in
// browser checks; Supabase and Appwrite have no external credentials and stay unconfigured.

test("dashboard follows the selected authentication configuration", async ({ page }) => {
  await page.goto("/dashboard");
  if (process.env.E2E_AUTH_ENABLED === "true") {
    await expect(page).toHaveURL(/\/login\?next=/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    return;
  }
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("link", { name: "Sign in" }).first()).toBeVisible();
});

test("login keeps a same-origin destination and drops external ones", async ({ page }) => {
  await page.goto("/login?next=%2Fprojects%3Ftab%3Da");
  await expect(page.locator('input[name="next"]')).toHaveValue("/projects?tab=a");
  await expect(page.getByRole("link", { name: "Create one" })).toHaveAttribute(
    "href",
    "/login?mode=signup&next=%2Fprojects%3Ftab%3Da",
  );

  await page.goto("/login?next=https%3A%2F%2Fevil.example");
  await expect(page.locator('input[name="next"]')).toHaveValue("/dashboard");
});

test("login explains the rate limit error", async ({ page }) => {
  await page.goto("/login?error=rate-limited");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Too many attempts");
});

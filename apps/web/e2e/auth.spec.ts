import { expect, test } from "@playwright/test";
import site from "../src/config/site.json";

// The browser suite runs without Supabase credentials, so these checks cover the
// unconfigured mode: pages stay explorable and redirects stay on this origin.

test("dashboard stays explorable while authentication is not configured", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole("heading", { name: "A better place to start building." }),
  ).toBeVisible();
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
  await expect(page.getByRole("alert")).toContainText("Too many attempts");
});

test("health endpoint reports the configured service id", async ({ request }) => {
  const health = await request.get("/api/health");
  expect(health.ok()).toBeTruthy();
  expect(await health.json()).toMatchObject({ status: "ok", service: site.serviceId });
});

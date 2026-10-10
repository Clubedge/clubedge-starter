import { expect, test } from "@playwright/test";
import { e2eApp } from "./app";

test("starter landing page loads with setup guidance", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Start with the foundation. Build what matters." }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Up and running in three steps" })).toBeVisible();
});

test("dashboard renders without providers configured", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole("heading", { name: "A better place to start building." }),
  ).toBeVisible();
});

test("health endpoint reports the configured service id", async ({ request }) => {
  const health = await request.get("/api/health");
  expect(health.ok()).toBeTruthy();
  expect(await health.json()).toMatchObject({ status: "ok", service: e2eApp.site.serviceId });
});

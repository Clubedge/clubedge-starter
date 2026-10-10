import { expect, test } from "@playwright/test";

test("starter landing page loads with setup guidance and a health endpoint", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Start with the foundation. Build what matters." }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Up and running in three steps" })).toBeVisible();
  const health = await request.get("/api/health");
  expect(health.ok()).toBeTruthy();
  expect((await health.json()).status).toBe("ok");
});

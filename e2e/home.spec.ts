import { expect, test } from "@playwright/test";

test("starter dashboard loads with setup guidance and a health endpoint", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A better place to start building." }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Get started" })).toBeVisible();
  const health = await request.get("/api/health");
  expect(health.ok()).toBeTruthy();
  expect((await health.json()).status).toBe("ok");
});

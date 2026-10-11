import { expect, test } from "@playwright/test";

// Queues the dashboard's sample job and waits for the worker inside the dev server to finish
// it. It needs a database and an auth provider, so it runs only with E2E_DATABASE=1 and
// E2E_AUTH_FLOW=1 (the Starter's CI runs it against each kind of local services).
test.skip(
  !process.env.E2E_DATABASE || !process.env.E2E_AUTH_FLOW,
  "needs a database and a configured auth provider",
);

test("runs the sample job in the background worker", async ({ page }) => {
  await page.goto("/login?mode=signup");
  await page.getByLabel("Email").fill(`jobs-${Date.now()}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill("correct horse battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.waitForLoadState("networkidle");

  const jobs = page.locator("#jobs");
  await expect(jobs).toContainText("No jobs yet");
  await jobs.getByRole("button", { name: "Run a sample job" }).click();
  await expect(jobs.getByRole("list", { name: "Recent jobs" })).toBeVisible({ timeout: 20_000 });

  // The page shows each job as it was when rendered: load it again until the worker has finished
  // the job. A fresh visit rather than reload(), which would resend the form and queue more jobs.
  await expect(async () => {
    await page.goto("/dashboard");
    await expect(jobs.getByRole("listitem").first()).toContainText("completed", {
      timeout: 1_000,
    });
  }).toPass({ timeout: 30_000 });
  await expect(jobs.getByRole("listitem")).toHaveCount(1);
});

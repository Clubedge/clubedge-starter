import { expect, test } from "@playwright/test";

test("verifies email and signs in through Firebase Auth Emulator", async ({ page }) => {
  const projectId = process.env.FIREBASE_PROJECT_ID ?? "demo-clubedge";
  const emulator = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";
  const email = `firebase-${Date.now()}@example.com`;
  const password = "correct horse battery";

  await page.goto("/login?mode=signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(
    page.getByText("Check your email to confirm your account, then sign in."),
  ).toBeVisible();

  let code: string | undefined;
  for (let attempt = 0; attempt < 20 && !code; attempt += 1) {
    const response = await fetch(
      `http://${emulator}/emulator/v1/projects/${projectId}/oobCodes`,
    );
    const payload = (await response.json()) as {
      oobCodes?: Array<{ email?: string; requestType?: string; oobCode?: string }>;
    };
    code = payload.oobCodes?.find(
      (entry) => entry.email === email && entry.requestType === "VERIFY_EMAIL",
    )?.oobCode;
    if (!code) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  expect(code, "Firebase Auth Emulator should have an email verification code").toBeTruthy();

  await page.goto(`/login?mode=verifyEmail&oobCode=${encodeURIComponent(code!)}`);
  await expect(page.getByText("Email confirmed. You can now sign in.")).toBeVisible();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
});

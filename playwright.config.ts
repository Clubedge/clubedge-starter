import { defineConfig, devices } from "@playwright/test";
import { e2eApp } from "./e2e/app";

const providerEnv = Object.fromEntries(
  [
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_URL",
    "FIREBASE_PROJECT_ID",
    "FIREBASE_API_KEY",
    "FIREBASE_AUTH_EMULATOR_HOST",
    "VITE_FIREBASE_PROJECT_ID",
    "VITE_FIREBASE_API_KEY",
    "VITE_FIREBASE_AUTH_DOMAIN",
    "VITE_FIREBASE_AUTH_EMULATOR_URL",
  ].flatMap((name) => (process.env[name] ? [[name, process.env[name] as string]] : [])),
);

// One browser suite for every framework. E2E_APP picks the app (defaults to apps/web).
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // The dev server compiles each page, route, and its client scripts on first use, which on a
  // cold CI runner can take longer than Playwright's defaults.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  // In CI, the github reporter also annotates each failure at its line in the test.
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    // Kept for failed tests: CI prints their page snapshot and uploads these as an artifact.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // The app, and the packages its dev task runs with (a frontend's API), each started here so
  // Playwright stops every one of them afterwards. An API is up once the app forwards its health.
  webServer: [
    { command: `pnpm --filter ${e2eApp.packageName} dev`, url: "http://127.0.0.1:3000" },
    ...e2eApp.siblings.map((name) => ({
      command: `pnpm --filter ${name} dev`,
      url: "http://127.0.0.1:3000/api/health",
    })),
  ].map((server) => ({
    ...server,
    reuseExistingServer: !process.env.CI,
    // The dev server's own output, so server errors appear next to the failing test.
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...providerEnv,
      // A placeholder unless set, so pages render without a database.
      DATABASE_URL:
        process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/postgres",
      // Next.js reads NEXT_PUBLIC_APP_URL; TanStack Start reads APP_URL; an API, FRONTEND_URL.
      NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3000",
      APP_URL: "http://127.0.0.1:3000",
      FRONTEND_URL: "http://127.0.0.1:3000",
      NODE_ENV: "development",
    },
  })),
});

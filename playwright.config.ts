import { defineConfig, devices } from "@playwright/test";
import { e2eApp } from "./e2e/app";

// One browser suite for every framework. E2E_APP picks the app (defaults to apps/web).
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3000", trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm --filter ${e2eApp.packageName} dev`,
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    env: {
      DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5432/postgres",
      // Next.js reads NEXT_PUBLIC_APP_URL; TanStack Start reads APP_URL.
      NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3000",
      APP_URL: "http://127.0.0.1:3000",
      NODE_ENV: "development",
    },
  },
});

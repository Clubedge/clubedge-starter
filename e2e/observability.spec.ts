import { expect, test } from "@playwright/test";
import { startTelemetryFake, type TelemetryFake } from "./telemetry-fake";

// Checks that the dev server sends request traces and browser errors to the configured provider.
// It needs the app pointed at ./telemetry-fake.ts (OTEL_EXPORTER_OTLP_ENDPOINT=
// http://127.0.0.1:4319, or SENTRY_DSN=http://public@127.0.0.1:4319/1 with
// SENTRY_TRACES_SAMPLE_RATE=1), so it runs only with E2E_OBSERVABILITY=1.
test.skip(!process.env.E2E_OBSERVABILITY, "needs the app pointed at the fake telemetry receiver");

// One receiver on one port for the whole file, so the tests run one after the other. The dev
// server compiles pages and routes on first use, so they get more time than the default.
test.describe.configure({ mode: "serial", timeout: 90_000 });

let fake: TelemetryFake;

test.beforeAll(async () => {
  fake = await startTelemetryFake();
});

test.afterAll(async () => {
  await fake?.stop();
});

test("sends request traces to the observability provider", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.locator("body")).toBeVisible();
  // Batched exports leave every few seconds; keep requesting until a span arrives.
  await expect
    .poll(
      async () => {
        await request.get("/api/health");
        return fake.spans.length;
      },
      { timeout: 60_000, intervals: [2_000] },
    )
    .toBeGreaterThan(0);
});

test("reports uncaught browser errors to the observability provider", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  // An error nothing catches, as a bug in a click handler or effect would raise.
  await page.evaluate(() => {
    setTimeout(() => {
      throw new Error("E2E browser error");
    }, 0);
  });
  await expect
    .poll(() => fake.errors.some((message) => message.includes("E2E browser error")), {
      timeout: 60_000,
      intervals: [2_000],
    })
    .toBe(true);
});

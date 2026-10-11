import { expect, test } from "@playwright/test";
import { startTelemetryFake } from "./telemetry-fake";

// Checks that the dev server sends request traces to the configured provider. It needs the app
// pointed at ./telemetry-fake.ts (OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4319, or
// SENTRY_DSN=http://public@127.0.0.1:4319/1 with SENTRY_TRACES_SAMPLE_RATE=1), so it runs only
// with E2E_OBSERVABILITY=1.
test.skip(!process.env.E2E_OBSERVABILITY, "needs the app pointed at the fake telemetry receiver");

test("sends request traces to the observability provider", async ({ page, request }) => {
  const fake = await startTelemetryFake();
  try {
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();
    // Batched exports leave every few seconds; keep requesting until a span arrives.
    await expect
      .poll(
        async () => {
          await request.get("/api/health");
          return fake.spans.length;
        },
        { timeout: 45_000, intervals: [2_000] },
      )
      .toBeGreaterThan(0);
  } finally {
    await fake.stop();
  }
});

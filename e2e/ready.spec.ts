import { expect, test } from "@playwright/test";

// /api/ready reports whether the database answers. Without one (the default browser run uses a
// placeholder URL) it is 503; with E2E_DATABASE=1 (the Starter's CI with a real database), 200.
test("reports readiness from the database", async ({ request }) => {
  const ready = Boolean(process.env.E2E_DATABASE);
  const response = await request.get("/api/ready");
  expect(response.status()).toBe(ready ? 200 : 503);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(await response.json()).toEqual({ status: ready ? "ok" : "unavailable" });
});

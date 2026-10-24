// Browser error reports: GET says how the browser should report its errors, read at runtime
// rather than at build time; POST takes a report and reports it like a server error.
import { Hono } from "hono";
import { reportError } from "@clubedge/core";
import { ClientError, parseClientErrorReport } from "@clubedge/observability";
import type { ApiDependencies } from "@/app";
import { apiError, jsonOnly, limitBody } from "@/http";
import { createMemoryLimiter, rateLimit } from "@/rate-limit";

const MAX_BODY = 16_384;

export function clientErrorRoutes(dependencies: ApiDependencies) {
  // Per address, so a broken page in one browser cannot flood the error reports.
  const limiter = (dependencies.createRateLimiter ?? createMemoryLimiter)(30, 60);

  return new Hono()
    .get("/api/client-errors", (c) => {
      c.header("Cache-Control", "no-store");
      return c.json(dependencies.browserErrorReporting?.() ?? { provider: "none" });
    })
    .post(
      "/api/client-errors",
      rateLimit(limiter, {
        scope: "client-errors",
        clientIpSettings: dependencies.clientIpSettings,
      }),
      jsonOnly,
      limitBody(MAX_BODY),
      async (c) => {
        // Read outside the try: limitBody answers 413 when the body outgrows MAX_BODY.
        const body = await c.req.text();
        let report;
        try {
          report = parseClientErrorReport(JSON.parse(body));
        } catch {
          report = null;
        }
        if (!report) return apiError(c, 400, "invalid_report", "The error report is not valid.");
        reportError(new ClientError(report), {
          message: "Browser error",
          attributes: { "url.path": report.path, "browser.event": report.kind },
        });
        return c.body(null, 204);
      },
    );
}

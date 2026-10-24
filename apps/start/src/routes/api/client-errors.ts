import { createFileRoute } from "@tanstack/react-router";
import { readTextBody, reportError } from "@clubedge/core";
import { ClientError, parseClientErrorReport } from "@clubedge/observability";
import { createRateLimiter } from "@/server/cache";
import { clientIp } from "@/server/client-ip";
import { browserErrorReporting } from "@/server/observability";

const MAX_BODY = 16_384;
// Per address, so a broken page in one browser cannot flood the error reports.
const clientErrorLimiter = createRateLimiter(30, 60);

async function isRateLimited(request: Request) {
  const ip = clientIp(request);
  try {
    const result = await clientErrorLimiter.limit(`client-errors:${ip}`);
    return !result.success;
  } catch (error) {
    reportError(error, { message: "Rate limiter unavailable" });
    return false;
  }
}

/** Takes an error report from the browser and reports it like a server error. */
async function receiveClientError(request: Request): Promise<Response> {
  if (await isRateLimited(request)) return new Response(null, { status: 429 });
  const body = await readTextBody(request, MAX_BODY);
  if (body === null) return new Response(null, { status: 413 });
  let report;
  try {
    report = parseClientErrorReport(JSON.parse(body));
  } catch {
    report = null;
  }
  if (!report) return new Response(null, { status: 400 });
  reportError(new ClientError(report), {
    message: "Browser error",
    attributes: { "url.path": report.path, "browser.event": report.kind },
  });
  return new Response(null, { status: 204 });
}

export const Route = createFileRoute("/api/client-errors")({
  server: {
    handlers: {
      // How the browser should report its errors, read at runtime rather than at build time.
      GET: () =>
        Response.json(browserErrorReporting(), { headers: { "Cache-Control": "no-store" } }),
      POST: ({ request }) => receiveClientError(request),
    },
  },
});

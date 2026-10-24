import { getClientIp, readTextBody, reportError } from "@clubedge/core";
import { ClientError, parseClientErrorReport } from "@clubedge/observability";
import { getClientIpSettings } from "@/env/server";
import { createRateLimiter } from "@/server/cache";
import { browserErrorReporting } from "@/server/observability";

export const dynamic = "force-dynamic";

const MAX_BODY = 16_384;
// Per address, so a broken page in one browser cannot flood the error reports.
const clientErrorLimiter = createRateLimiter(30, 60);

async function isRateLimited(request: Request) {
  // Next.js gives route handlers no connection address: without CLIENT_IP_HEADER or
  // TRUSTED_PROXY_HOPS, every client shares one count (SETUP.md, "Client addresses").
  const ip = getClientIp(request.headers, getClientIpSettings());
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

/** How the browser should report its errors, read at runtime rather than at build time. */
export function GET() {
  return Response.json(browserErrorReporting(), { headers: { "Cache-Control": "no-store" } });
}

export function POST(request: Request) {
  return receiveClientError(request);
}

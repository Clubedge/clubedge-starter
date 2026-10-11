import { isDatabaseReady } from "@clubedge/db";
import { getDb } from "@/server/db";

export const dynamic = "force-dynamic";

/**
 * Readiness: 200 when the database answers, 503 otherwise, without details. /api/health stays a
 * liveness check, so a brief database outage does not make the platform restart the app.
 */
export async function GET() {
  const ready = await Promise.resolve()
    .then(() => isDatabaseReady(getDb()))
    .catch(() => false);
  return Response.json(
    { status: ready ? "ok" : "unavailable" },
    { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}

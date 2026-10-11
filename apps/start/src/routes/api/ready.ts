import { createFileRoute } from "@tanstack/react-router";
import { isDatabaseReady } from "@clubedge/db";
import { getDb } from "@/server/db";

/**
 * Readiness: 200 when the database answers, 503 otherwise, without details. /api/health stays a
 * liveness check, so a brief database outage does not make the platform restart the app.
 */
export const Route = createFileRoute("/api/ready")({
  server: {
    handlers: {
      GET: async () => {
        const ready = await Promise.resolve()
          .then(() => isDatabaseReady(getDb()))
          .catch(() => false);
        return Response.json(
          { status: ready ? "ok" : "unavailable" },
          { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } },
        );
      },
    },
  },
});

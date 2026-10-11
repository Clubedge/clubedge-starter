import { timingSafeEqual } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { getCronSecret, getJobs } from "@/server/jobs";

function isAuthorized(request: Request, secret: string): boolean {
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Runs the jobs that are due, for hosts without a long-running worker: call it on a schedule
 * with `Authorization: Bearer $CRON_SECRET` (Vercel Cron sends that header itself).
 */
export const Route = createFileRoute("/api/jobs/run")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = getCronSecret();
        if (!secret) return Response.json({ error: "Not found" }, { status: 404 });
        if (!isAuthorized(request, secret))
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        const result = await getJobs().runDue();
        return Response.json(result, { headers: { "Cache-Control": "no-store" } });
      },
    },
  },
});

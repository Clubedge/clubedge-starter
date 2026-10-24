// Runs the jobs that are due, for a scheduler where no worker runs (JOBS_WORKER=off): call it on a
// schedule with `Authorization: Bearer $CRON_SECRET`. Without CRON_SECRET it does not exist.
import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import type { DueJobsRun } from "@clubedge/contract";
import { apiError } from "@/http";
import type { BackgroundJobs } from "@/routes/jobs";

function isAuthorized(header: string | undefined, secret: string): boolean {
  const given = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function jobsRunRoutes(jobs: BackgroundJobs) {
  return new Hono().get("/api/jobs/run", async (c) => {
    const secret = jobs.cronSecret?.();
    if (!secret) return apiError(c, 404, "not_found", "No such API endpoint.");
    if (!isAuthorized(c.req.header("authorization"), secret)) {
      return apiError(c, 401, "unauthorized", "Send the CRON_SECRET as a bearer token.");
    }
    c.header("Cache-Control", "no-store");
    return c.json<DueJobsRun>(await jobs.queue().runDue());
  });
}

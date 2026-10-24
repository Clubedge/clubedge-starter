// Background jobs for the dashboard: how they run and the current user's recent sample jobs,
// and a button's worth of work to queue the sample job.
import { Hono } from "hono";
import type { JobsStatus, SampleJobQueued } from "@clubedge/contract";
import { reportError } from "@clubedge/core";
import type { JobQueue } from "@clubedge/jobs";
import type { ApiDependencies } from "@/app";
import { apiError, jsonOnly } from "@/http";
import { sampleJob } from "@/jobs";

/** What the jobs routes need from src/server/jobs, so tests can pass a memory queue. */
export interface BackgroundJobs {
  /**
   * Where jobs run: this API's worker, a scheduler calling /api/jobs/run, or a jobs service
   * (Inngest) calling /api/inngest.
   */
  runner(): JobsStatus["runner"];
  /** The queue, created on first use. */
  queue(): JobQueue;
  /** Authorizes GET /api/jobs/run; null, or absent, turns it off. */
  cronSecret?(): string | null;
}

/** Who the sample job runs for: the signed-in user's email, or "anonymous". */
async function requester(dependencies: ApiDependencies, request: Request) {
  const user = await dependencies.getCurrentUser(request);
  return user?.email ?? "anonymous";
}

export function jobsRoutes(jobs: BackgroundJobs, dependencies: ApiDependencies) {
  return new Hono()
    .get("/api/jobs", async (c) => {
      c.header("Cache-Control", "no-store");
      const runner = jobs.runner();
      try {
        const recent = await jobs.queue().recent(sampleJob, {
          data: { requestedBy: await requester(dependencies, c.req.raw) },
          limit: 5,
        });
        return c.json<JobsStatus>({
          runner,
          jobs: recent.map(({ id, name, state, createdAt, completedAt }) => ({
            id,
            name,
            state,
            createdAt: createdAt.toISOString(),
            completedAt: completedAt?.toISOString() ?? null,
          })),
        });
      } catch (error) {
        reportError(error, { message: "Background jobs: could not list recent jobs." });
        return c.json<JobsStatus>({ runner, jobs: null });
      }
    })
    .post("/api/jobs/sample", jsonOnly, async (c) => {
      const requestedBy = await requester(dependencies, c.req.raw);
      try {
        // Repeated clicks within seconds are ignored, and answer id null.
        const id = await jobs
          .queue()
          .enqueue(sampleJob, { requestedBy }, { key: requestedBy, throttleSeconds: 2 });
        return c.json<SampleJobQueued>({ id }, 202);
      } catch (error) {
        reportError(error, { message: "Background jobs: could not queue the sample job." });
        return apiError(c, 503, "unavailable", "Background jobs are unavailable.");
      }
    });
}

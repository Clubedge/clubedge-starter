import { z } from "zod";
import type { JobQueue } from "@clubedge/jobs";
import { directDatabaseUrl } from "@clubedge/db/urls";
import { createPgBossJobs } from "@clubedge/jobs-pg-boss";
import { reportError } from "@clubedge/core";
import { jobs } from "@/jobs";
import { getServerEnv, optional, parseEnv } from "@/env";
import type { BackgroundJobs } from "@/routes/jobs";

// Jobs stored in the API's PostgreSQL through pg-boss, behind the provider-neutral JobQueue, and
// run by a worker inside the API process.
const jobsEnvSchema = z.object({
  JOBS_WORKER: optional(z.enum(["on", "off"])),
  // Authorizes /api/jobs/run, which runs due jobs where no worker runs; unset disables it.
  CRON_SECRET: optional(z.string().min(16)),
});

const jobsEnv = () => parseEnv(jobsEnvSchema, "Jobs");

/** Whether this API runs a worker: yes, unless JOBS_WORKER=off hands the jobs to a scheduler. */
export function isWorkerEnabled(): boolean {
  return jobsEnv().JOBS_WORKER !== "off";
}

const globalForJobs = globalThis as typeof globalThis & { clubedgeJobs?: JobQueue };

/** One queue per process, shared with the worker and across dev restarts. */
export function getJobs(): JobQueue {
  if (globalForJobs.clubedgeJobs) return globalForJobs.clubedgeJobs;
  const env = getServerEnv();
  const worker = isWorkerEnabled();
  globalForJobs.clubedgeJobs = createPgBossJobs({
    // A worker holds its connections for the life of the process, so it takes the direct URL
    // when there is one; an API that only enqueues stays on the pooled DATABASE_URL.
    connectionString: worker
      ? (directDatabaseUrl(process.env) ?? env.DATABASE_URL)
      : env.DATABASE_URL,
    jobs,
    worker,
    maxConnections: env.NODE_ENV === "production" ? 4 : 2,
    onError: (error, context) =>
      reportError(error, {
        message: context ? `Background job "${context.job}" failed` : "Background jobs error",
        attributes: context,
      }),
  });
  return globalForJobs.clubedgeJobs;
}

/** What the routes need: src/server/index.ts passes it to the app. */
export const backgroundJobs: BackgroundJobs = {
  runner: () => (isWorkerEnabled() ? "worker" : "scheduler"),
  queue: getJobs,
  cronSecret: () => jobsEnv().CRON_SECRET || null,
};

/** Starts the worker when this API should run one, retrying until the database answers. */
export function startJobsWorker() {
  let queue: JobQueue;
  try {
    if (!isWorkerEnabled()) return;
    queue = getJobs();
  } catch (error) {
    // Invalid configuration, such as a missing DATABASE_URL, is reported once; the rest of the
    // API keeps serving instead of failing to start.
    reportError(error, { message: "Background jobs: the worker did not start." });
    return;
  }
  const start = () =>
    queue.startWorker().catch((error: unknown) => {
      reportError(error, {
        message: "Background jobs: the worker could not start, retrying in 5 seconds.",
      });
      setTimeout(start, 5_000).unref();
    });
  void start();
}

/** Stops the worker, letting running jobs finish, if this process created a queue. */
export async function stopJobsWorker() {
  await globalForJobs.clubedgeJobs?.stop();
}

import "@tanstack/react-start/server-only";
import { z } from "zod";
import type { JobQueue } from "@clubedge/jobs";
import { createPgBossJobs } from "@clubedge/jobs-pg-boss";
import { jobs } from "@/jobs";
import { getServerEnv, optional, parseEnv } from "@/env/server";

export type { JobRecord } from "@clubedge/jobs";

// Jobs stored in the app's PostgreSQL through pg-boss, behind the provider-neutral JobQueue.
const jobsEnvSchema = z.object({
  JOBS_WORKER: optional(z.enum(["on", "off"])),
  // Authorizes /api/jobs/run, which runs due jobs where no worker can; unset disables it.
  CRON_SECRET: optional(z.string().min(16)),
});

const jobsEnv = () => parseEnv(jobsEnvSchema, "Jobs");

/**
 * Whether this server runs a worker. Serverless functions (Vercel, Netlify) stop between
 * requests, so there jobs run when a scheduler calls /api/jobs/run instead.
 */
export function isWorkerEnabled(): boolean {
  const { JOBS_WORKER } = jobsEnv();
  if (JOBS_WORKER) return JOBS_WORKER === "on";
  return !process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME;
}

export function getCronSecret(): string | null {
  return jobsEnv().CRON_SECRET || null;
}

const globalForJobs = globalThis as typeof globalThis & { clubedgeJobs?: JobQueue };

/** One queue per process, shared with the worker and across dev reloads. */
export function getJobs(): JobQueue {
  if (globalForJobs.clubedgeJobs) return globalForJobs.clubedgeJobs;
  const env = getServerEnv();
  globalForJobs.clubedgeJobs = createPgBossJobs({
    connectionString: env.DATABASE_URL,
    jobs,
    worker: isWorkerEnabled(),
    maxConnections: env.NODE_ENV === "production" ? 4 : 2,
  });
  return globalForJobs.clubedgeJobs;
}

/** Starts the worker when this server should run one, retrying until the database answers. */
export function startJobsWorker() {
  if (!isWorkerEnabled()) return;
  const start = () =>
    getJobs()
      .startWorker()
      .catch((error: unknown) => {
        console.error("Background jobs: the worker could not start, retrying in 5 seconds.", error);
        setTimeout(start, 5_000).unref();
      });
  void start();
}

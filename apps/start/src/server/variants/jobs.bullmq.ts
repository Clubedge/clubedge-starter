import "@tanstack/react-start/server-only";
import { z } from "zod";
import type { JobQueue } from "@clubedge/jobs";
import { createBullMqJobs } from "@clubedge/jobs-bullmq";
import { jobs } from "@/jobs";
import { getServerEnv, optional, parseEnv } from "@/env/server";
import { reportError } from "@clubedge/core";

export type { JobRecord } from "@clubedge/jobs";

// Jobs stored in Redis through BullMQ, behind the provider-neutral JobQueue.
const jobsEnvSchema = z.object({
  REDIS_URL: z.string().min(1, "REDIS_URL is required for background jobs"),
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

/**
 * How this server's jobs run, for the dashboard: in its own worker, when a scheduler calls
 * /api/jobs/run, or by a jobs service that calls the app.
 */
export function jobsRunner(): "worker" | "scheduler" | "service" {
  return isWorkerEnabled() ? "worker" : "scheduler";
}

export function getCronSecret(): string | null {
  return jobsEnv().CRON_SECRET || null;
}

const globalForJobs = globalThis as typeof globalThis & { clubedgeJobs?: JobQueue };

/** One queue per process, shared with the worker and across dev reloads. */
export function getJobs(): JobQueue {
  if (globalForJobs.clubedgeJobs) return globalForJobs.clubedgeJobs;
  const env = getServerEnv();
  globalForJobs.clubedgeJobs = createBullMqJobs({
    redisUrl: jobsEnv().REDIS_URL,
    jobs,
    worker: isWorkerEnabled(),
    concurrency: env.NODE_ENV === "production" ? 4 : 1,
    onError: (error, context) =>
      reportError(error, {
        message: context ? `Background job "${context.job}" failed` : "Background jobs error",
        attributes: context,
      }),
  });
  return globalForJobs.clubedgeJobs;
}

/** Starts the worker when this server should run one, retrying until Redis answers. */
export function startJobsWorker() {
  let jobs: JobQueue;
  try {
    if (!isWorkerEnabled()) return;
    jobs = getJobs();
  } catch (error) {
    // Invalid configuration, such as a missing REDIS_URL, is reported once; the rest of the app
    // keeps serving instead of failing to start.
    reportError(error, { message: "Background jobs: the worker did not start." });
    return;
  }
  const start = () =>
    jobs.startWorker().catch((error: unknown) => {
      reportError(error, {
        message: "Background jobs: the worker could not start, retrying in 5 seconds.",
      });
      setTimeout(start, 5_000).unref();
    });
  void start();
}

/** Stops the worker, if this process created a queue. */
export async function stopJobsWorker() {
  await globalForJobs.clubedgeJobs?.stop();
}

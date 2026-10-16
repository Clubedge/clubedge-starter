import "server-only";
import { z } from "zod";
import type { JobQueue } from "@clubedge/jobs";
import { createInngestJobs } from "@clubedge/jobs-inngest";
import { jobs } from "@/jobs";
import { getServerEnv, optional, parseEnv } from "@/env/server";
import { reportError } from "@clubedge/core";

export type { JobRecord } from "@clubedge/jobs";

// Jobs run by Inngest, behind the provider-neutral JobQueue: the app sends an event per job, and
// Inngest calls /api/inngest to run it, with retries and schedules. Nothing runs between requests.
const jobsEnvSchema = z.object({
  // The local Inngest Dev Server (pnpm jobs:dev): 1, or its URL. Unset in production.
  INNGEST_DEV: optional(z.string()),
  INNGEST_EVENT_KEY: optional(z.string()),
  INNGEST_SIGNING_KEY: optional(z.string()),
});

const jobsEnv = () => parseEnv(jobsEnvSchema, "Jobs");

/** No worker runs in this server: Inngest calls it to run each job. */
export function isWorkerEnabled(): boolean {
  return false;
}

/**
 * How this server's jobs run, for the dashboard: in its own worker, when a scheduler calls
 * /api/jobs/run, or by a jobs service that calls the app.
 */
export function jobsRunner(): "worker" | "scheduler" | "service" {
  return "service";
}

/** The Dev Server outside production, unless INNGEST_DEV says otherwise. */
function devServer(value: string | undefined): boolean | string {
  if (!value) return getServerEnv().NODE_ENV !== "production";
  if (/^(0|false)$/i.test(value)) return false;
  if (/^(1|true)$/i.test(value)) return true;
  return value;
}

const globalForJobs = globalThis as typeof globalThis & { clubedgeJobs?: JobQueue };

/** One client per process, shared across dev reloads. */
export function getJobs(): JobQueue {
  if (globalForJobs.clubedgeJobs) return globalForJobs.clubedgeJobs;
  const env = jobsEnv();
  globalForJobs.clubedgeJobs = createInngestJobs({
    jobs,
    dev: devServer(env.INNGEST_DEV),
    eventKey: env.INNGEST_EVENT_KEY || undefined,
    signingKey: env.INNGEST_SIGNING_KEY || undefined,
    onError: (error, context) =>
      reportError(error, {
        message: context ? `Background job "${context.job}" failed` : "Background jobs error",
        attributes: context,
      }),
  });
  return globalForJobs.clubedgeJobs;
}

/** Inngest runs the jobs, so there is no worker to start. */
export function startJobsWorker() {}

export async function stopJobsWorker() {
  await globalForJobs.clubedgeJobs?.stop();
}

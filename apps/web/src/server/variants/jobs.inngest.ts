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

/**
 * Inngest runs the jobs, so there is no worker to start. In development, once this server
 * answers, it asks the Dev Server to sync its jobs (a PUT to its own /api/inngest), so jobs run
 * whichever of pnpm dev and pnpm jobs:dev started first.
 */
export function startJobsWorker() {
  if (getServerEnv().NODE_ENV === "production" || devServer(jobsEnv().INNGEST_DEV) === false)
    return;
  const endpoint = new URL(
    "/api/inngest",
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  ).toString();
  let tries = 0;
  const sync = () =>
    fetch(endpoint, { method: "PUT", signal: AbortSignal.timeout(10_000) })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(`${response.status} ${(await response.text()).slice(0, 200)}`);
        console.info("Background jobs: synced with the Inngest Dev Server.");
      })
      .catch((error: unknown) => {
        // The server may not listen yet, or the Dev Server may not run: try for about a minute.
        if (++tries < 30) setTimeout(sync, 2_000).unref();
        else
          console.warn(
            "Background jobs: could not sync with the Inngest Dev Server; is pnpm jobs:dev running?",
            error,
          );
      });
  setTimeout(sync, 2_000).unref();
}

export async function stopJobsWorker() {
  await globalForJobs.clubedgeJobs?.stop();
}

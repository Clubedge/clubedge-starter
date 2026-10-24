import { z } from "zod";
import type { JobQueue } from "@clubedge/jobs";
import { createInngestJobs } from "@clubedge/jobs-inngest";
import { reportError } from "@clubedge/core";
import { jobs } from "@/jobs";
import { getServerEnv, optional, parseEnv } from "@/env";
import type { BackgroundJobs } from "@/routes/jobs";

// Jobs run by Inngest, behind the provider-neutral JobQueue: the API sends an event per job, and
// Inngest calls /api/inngest to run it, with retries and schedules. Inngest reaches the API through
// the frontend's proxy, at FRONTEND_URL, so the API itself stays private.
const jobsEnvSchema = z.object({
  FRONTEND_URL: z.url().default("http://localhost:3000"),
  // The local Inngest Dev Server (pnpm jobs:dev): 1, or its URL. Unset in production.
  INNGEST_DEV: optional(z.string()),
  INNGEST_EVENT_KEY: optional(z.string()),
  INNGEST_SIGNING_KEY: optional(z.string()),
});

const jobsEnv = () => parseEnv(jobsEnvSchema, "Jobs");

/** The Dev Server outside production, unless INNGEST_DEV says otherwise. */
function devServer(value: string | undefined): boolean | string {
  if (!value) return getServerEnv().NODE_ENV !== "production";
  if (/^(0|false)$/i.test(value)) return false;
  if (/^(1|true)$/i.test(value)) return true;
  return value;
}

const globalForJobs = globalThis as typeof globalThis & { clubedgeJobs?: JobQueue };

/** One client per process, shared across dev restarts. */
export function getJobs(): JobQueue {
  if (globalForJobs.clubedgeJobs) return globalForJobs.clubedgeJobs;
  const env = jobsEnv();
  globalForJobs.clubedgeJobs = createInngestJobs({
    jobs,
    dev: devServer(env.INNGEST_DEV),
    eventKey: env.INNGEST_EVENT_KEY || undefined,
    signingKey: env.INNGEST_SIGNING_KEY || undefined,
    // The frontend's proxy changes the host and protocol the API sees, so Inngest is told the
    // frontend's origin instead.
    serveOrigin: new URL(env.FRONTEND_URL).origin,
    onError: (error, context) =>
      reportError(error, {
        message: context ? `Background job "${context.job}" failed` : "Background jobs error",
        attributes: context,
      }),
  });
  return globalForJobs.clubedgeJobs;
}

/** What the routes need: src/server/index.ts passes it to the app. No worker, so no cron. */
export const backgroundJobs: BackgroundJobs = {
  runner: () => "service",
  queue: getJobs,
};

/**
 * Inngest runs the jobs, so there is no worker to start. In development, once the API answers,
 * it asks the Dev Server to sync its jobs (a PUT to /api/inngest through the frontend), so jobs
 * run whichever of pnpm dev and pnpm jobs:dev started first.
 */
export function startJobsWorker() {
  let endpoint: string;
  try {
    const env = jobsEnv();
    if (getServerEnv().NODE_ENV === "production" || devServer(env.INNGEST_DEV) === false) return;
    endpoint = new URL("/api/inngest", env.FRONTEND_URL).toString();
  } catch (error) {
    reportError(error, { message: "Background jobs: could not sync with Inngest." });
    return;
  }
  let tries = 0;
  const sync = () =>
    fetch(endpoint, { method: "PUT", signal: AbortSignal.timeout(10_000) })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(`${response.status} ${(await response.text()).slice(0, 200)}`);
        console.info("Background jobs: synced with the Inngest Dev Server.");
      })
      .catch((error: unknown) => {
        // The frontend may not listen yet, or the Dev Server may not run: try for about a minute.
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

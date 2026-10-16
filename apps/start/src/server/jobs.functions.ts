import { createServerFn } from "@tanstack/react-start";
import { sampleJob } from "@/jobs";
import { getJobs, jobsRunner } from "./jobs";
import { sampleJobRequester } from "./jobs-forms";
import { reportError } from "@clubedge/core";

/** What the dashboard's jobs card shows; serializable, so it can cross to the browser. */
export const getJobsStatus = createServerFn({ method: "GET" }).handler(async () => {
  const runner = jobsRunner();
  try {
    const jobs = await getJobs().recent(sampleJob, {
      data: { requestedBy: await sampleJobRequester() },
      limit: 5,
    });
    return {
      runner,
      jobs: jobs.map(({ id, name, state, createdAt }) => ({
        id,
        name,
        state,
        createdAt: createdAt.toISOString(),
      })),
    };
  } catch (error) {
    reportError(error, { message: "Background jobs: could not list recent jobs." });
    return { runner, jobs: null };
  }
});

export type JobsStatus = Awaited<ReturnType<typeof getJobsStatus>>;

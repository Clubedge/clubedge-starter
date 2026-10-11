import { createServerFn } from "@tanstack/react-start";
import { sampleJob } from "@/jobs";
import { getJobs, isWorkerEnabled } from "./jobs";
import { sampleJobRequester } from "./jobs-forms";

/** What the dashboard's jobs card shows; serializable, so it can cross to the browser. */
export const getJobsStatus = createServerFn({ method: "GET" }).handler(async () => {
  const worker = isWorkerEnabled();
  try {
    const jobs = await getJobs().recent(sampleJob, {
      data: { requestedBy: await sampleJobRequester() },
      limit: 5,
    });
    return {
      worker,
      jobs: jobs.map(({ id, name, state, createdAt }) => ({
        id,
        name,
        state,
        createdAt: createdAt.toISOString(),
      })),
    };
  } catch (error) {
    console.error("Background jobs: could not list recent jobs.", error);
    return { worker, jobs: null };
  }
});

export type JobsStatus = Awaited<ReturnType<typeof getJobsStatus>>;

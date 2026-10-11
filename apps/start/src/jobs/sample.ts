import { defineJob } from "@clubedge/jobs";

/** An example job that the dashboard can start; replace it with your own. */
export const sampleJob = defineJob<{ requestedBy: string }>({
  name: "sample",
  async run({ requestedBy }, { attempt }) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return { message: `Hello, ${requestedBy}, from the jobs worker.`, attempt };
  },
});

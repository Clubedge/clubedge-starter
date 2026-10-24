import { describe, expect, it } from "vitest";
import { createMemoryJobs } from "@clubedge/jobs";
import { createApp } from "@/app";
import { sampleJob } from "@/jobs/sample";

const secret = "a-cron-secret-of-16-or-more";

function setup(cronSecret: string | null) {
  const queue = createMemoryJobs([sampleJob]);
  const app = createApp({
    serviceId: "my-product",
    isReady: async () => true,
    getCurrentUser: async () => null,
    jobs: { runner: () => "scheduler", queue: () => queue, cronSecret: () => cronSecret },
  });
  const run = (authorization?: string) =>
    app.request("/api/jobs/run", authorization ? { headers: { authorization } } : {});
  return { queue, run };
}

describe("/api/jobs/run", () => {
  it("does not exist without CRON_SECRET", async () => {
    expect((await setup(null).run(`Bearer ${secret}`)).status).toBe(404);
  });

  it("refuses a caller without the secret", async () => {
    const { run } = setup(secret);
    expect((await run()).status).toBe(401);
    expect((await run("Bearer the-wrong-secret-entirely")).status).toBe(401);
  });

  it("runs the jobs that are due for the scheduler", async () => {
    const { queue, run } = setup(secret);
    await queue.enqueue(sampleJob, { requestedBy: "anonymous" });
    const response = await run(`Bearer ${secret}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ completed: 1, failed: 0 });
  });
});

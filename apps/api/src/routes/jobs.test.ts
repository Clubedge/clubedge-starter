import { describe, expect, it } from "vitest";
import type { JobsStatus } from "@clubedge/contract";
import { createMemoryJobs } from "@clubedge/jobs";
import { createApp } from "@/app";
import { sampleJob } from "@/jobs/sample";

const user = { id: "user-1", email: "ada@example.com", displayName: null };

function setup(signedIn = true) {
  const queue = createMemoryJobs([sampleJob]);
  const app = createApp({
    serviceId: "my-product",
    isReady: async () => true,
    getCurrentUser: async () => (signedIn ? user : null),
    jobs: { runner: () => "worker", queue: () => queue },
  });
  const queueSample = () =>
    app.request("/api/jobs/sample", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
  const status = async () => (await (await app.request("/api/jobs")).json()) as JobsStatus;
  return { app, queue, queueSample, status };
}

describe("/api/jobs", () => {
  it("queues the sample job for the signed-in user and lists it", async () => {
    const { queue, queueSample, status } = setup();
    const response = await queueSample();
    expect(response.status).toBe(202);
    const { id } = (await response.json()) as { id: string | null };
    expect(id).toEqual(expect.any(String));
    expect(queue.jobs[0]?.data).toEqual({ requestedBy: "ada@example.com" });

    expect(await status()).toEqual({
      runner: "worker",
      jobs: [
        { id, name: "sample", state: "queued", createdAt: expect.any(String), completedAt: null },
      ],
    });
    await queue.runDue();
    expect((await status()).jobs?.[0]).toMatchObject({
      state: "completed",
      completedAt: expect.any(String),
    });
  });

  it("ignores a repeat within seconds", async () => {
    const { queueSample } = setup();
    await queueSample();
    expect(await (await queueSample()).json()).toEqual({ id: null });
  });

  it("lists only the current user's jobs", async () => {
    const signedIn = setup();
    await signedIn.queueSample();
    const { app } = setup(false);
    expect(((await (await app.request("/api/jobs")).json()) as JobsStatus).jobs).toEqual([]);
  });

  it("reports jobs as null when the queue cannot be read", async () => {
    const app = createApp({
      serviceId: "my-product",
      isReady: async () => false,
      getCurrentUser: async () => null,
      jobs: {
        runner: () => "scheduler",
        queue: () => {
          throw new Error("The database is unreachable.");
        },
      },
    });
    expect(await (await app.request("/api/jobs")).json()).toEqual({
      runner: "scheduler",
      jobs: null,
    });
    const queued = await app.request("/api/jobs/sample", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(queued.status).toBe(503);
  });
});

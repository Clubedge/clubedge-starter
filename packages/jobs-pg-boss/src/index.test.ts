import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";
import { defineJob, type JobDefinition } from "@clubedge/jobs";
import { createPgBossJobs, fromPglite } from "./index";

// pg-boss runs its real SQL against an in-process PostgreSQL, so no database server is needed.
const queues: { stop(): Promise<void> }[] = [];

function createQueue(jobs: JobDefinition[], worker = false) {
  const pglite = new PGlite();
  const queue = createPgBossJobs({
    db: fromPglite(pglite),
    backend: "pglite",
    jobs,
    worker,
    pollingIntervalSeconds: 0.5,
  });
  queues.push(queue);
  return queue;
}

async function waitFor<T>(read: () => Promise<T>, done: (value: T) => boolean) {
  for (let tries = 0; tries < 100; tries++) {
    const value = await read();
    if (done(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for the job.");
}

afterEach(async () => {
  await Promise.all(queues.splice(0).map((queue) => queue.stop()));
});

describe("createPgBossJobs", () => {
  it("runs due jobs on demand and records their output", async () => {
    const greet = defineJob<{ name: string }>({
      name: "greet",
      run: async ({ name }) => `Hello, ${name}`,
    });
    const queue = createQueue([greet]);

    const id = await queue.enqueue(greet, { name: "Ada" });
    expect(id).toBeTruthy();
    expect((await queue.recent(greet))[0]).toMatchObject({ id, state: "queued", attempts: 0 });

    expect(await queue.runDue()).toEqual({ completed: 1, failed: 0 });
    expect((await queue.recent(greet))[0]).toMatchObject({
      id,
      state: "completed",
      attempts: 1,
      output: { value: "Hello, Ada" },
    });
  }, 30_000);

  it("runs jobs in a worker and retries failures", async () => {
    let calls = 0;
    const flaky = defineJob({
      name: "flaky",
      retryLimit: 1,
      retryDelaySeconds: 0,
      run: async () => {
        calls++;
        if (calls === 1) throw new Error("first attempt fails");
        return { ok: true };
      },
    });
    const queue = createQueue([flaky], true);
    await queue.startWorker();

    await queue.enqueue(flaky, {});
    const [job] = await waitFor(
      () => queue.recent(flaky),
      (jobs) => jobs[0]?.state === "completed",
    );
    expect(job).toMatchObject({ attempts: 2, output: { ok: true } });
    expect(calls).toBe(2);
  }, 30_000);

  it("filters recent jobs by data and throttles by key", async () => {
    const note = defineJob<{ userId: string }>({ name: "note", run: async () => null });
    const queue = createQueue([note]);

    await queue.enqueue(note, { userId: "u1" });
    await queue.enqueue(note, { userId: "u2" });
    expect(
      await queue.enqueue(note, { userId: "u1" }, { key: "u1", throttleSeconds: 60 }),
    ).toBeTruthy();
    expect(
      await queue.enqueue(note, { userId: "u1" }, { key: "u1", throttleSeconds: 60 }),
    ).toBeNull();

    const mine = await queue.recent(note, { data: { userId: "u1" } });
    expect(mine).toHaveLength(2);
    expect(mine.every((job) => (job.data as { userId: string }).userId === "u1")).toBe(true);
  }, 30_000);

  it("marks a job failed after its last retry", async () => {
    const broken = defineJob({
      name: "broken",
      retryLimit: 0,
      run: async () => {
        throw new Error("always fails");
      },
    });
    const queue = createQueue([broken]);
    await queue.enqueue(broken, {});

    expect(await queue.runDue()).toEqual({ completed: 0, failed: 1 });
    expect((await queue.recent(broken))[0]).toMatchObject({ state: "failed", attempts: 1 });
  }, 30_000);

  it("refuses to start a worker in a queue created without one", async () => {
    const queue = createQueue([]);
    await expect(queue.startWorker()).rejects.toThrow("worker: true");
  });
});

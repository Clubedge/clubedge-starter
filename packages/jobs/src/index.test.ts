import { describe, expect, it } from "vitest";
import { createMemoryJobs, defineJob } from "./index";

describe("createMemoryJobs", () => {
  it("runs queued jobs and records their output", async () => {
    const greet = defineJob<{ name: string }>({
      name: "greet",
      run: async ({ name }) => ({ greeting: `Hello, ${name}` }),
    });
    const queue = createMemoryJobs([greet]);

    const id = await queue.enqueue(greet, { name: "Ada" });
    expect(await queue.runDue()).toEqual({ completed: 1, failed: 0 });

    const [job] = await queue.recent(greet);
    expect(job).toMatchObject({ id, state: "completed", attempts: 1 });
    expect(job!.output).toEqual({ greeting: "Hello, Ada" });
  });

  it("retries a failing job until retryLimit, then marks it failed", async () => {
    let calls = 0;
    const flaky = defineJob({
      name: "flaky",
      retryLimit: 1,
      run: async () => {
        calls++;
        throw new Error("boom");
      },
    });
    const queue = createMemoryJobs([flaky]);
    await queue.enqueue(flaky, {});

    expect(await queue.runDue()).toEqual({ completed: 0, failed: 1 });
    expect(calls).toBe(2);
    const [job] = await queue.recent(flaky);
    expect(job).toMatchObject({ state: "failed", attempts: 2, output: { message: "boom" } });
  });

  it("throttles jobs with the same key", async () => {
    const ping = defineJob({ name: "ping", run: async () => null });
    const queue = createMemoryJobs([ping]);

    expect(await queue.enqueue(ping, {}, { key: "a", throttleSeconds: 60 })).not.toBeNull();
    expect(await queue.enqueue(ping, {}, { key: "a", throttleSeconds: 60 })).toBeNull();
    expect(await queue.enqueue(ping, {}, { key: "b", throttleSeconds: 60 })).not.toBeNull();
  });

  it("waits for delayed jobs and filters recent jobs by data", async () => {
    let now = 0;
    const note = defineJob<{ userId: string }>({ name: "note", run: async () => null });
    const queue = createMemoryJobs([note], { now: () => now });

    await queue.enqueue(note, { userId: "u1" }, { delaySeconds: 30 });
    await queue.enqueue(note, { userId: "u2" });
    expect(await queue.runDue()).toEqual({ completed: 1, failed: 0 });
    now = 31_000;
    expect(await queue.runDue()).toEqual({ completed: 1, failed: 0 });

    const mine = await queue.recent(note, { data: { userId: "u1" } });
    expect(mine.map((job) => job.data)).toEqual([{ userId: "u1" }]);
  });

  it("rejects jobs that were not defined", async () => {
    const queue = createMemoryJobs([]);
    await expect(
      queue.enqueue(defineJob({ name: "missing", run: async () => null }), {}),
    ).rejects.toThrow('"missing" is not defined');
  });
});

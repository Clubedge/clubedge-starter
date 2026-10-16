// The behaviour every JobQueue provider must have, as one test suite. A provider's tests call
// describeJobQueue with a factory, so a new provider is proven by passing it rather than by
// review, and providers can't drift apart on retries, throttling, timeouts, or history:
//
//   describeJobQueue("pg-boss", (jobs, { worker }) => createPgBossJobs({ ..., jobs, worker }));
//
// It runs in Vitest, which is why it is a separate entry (`@clubedge/jobs/conformance`) that only
// tests import. Jobs are run with runDue where possible, so the suite needs no timing guesses.
import { afterEach, describe, expect, it } from "vitest";
import { defineJob, type JobDefinition, type JobQueue, type JobRecord } from "./index";

export interface ConformanceOptions {
  /** Skip the whole suite, for example when the provider's server isn't available. */
  skip?: boolean | string;
  /** Per-test timeout in milliseconds, for providers behind a network round trip. Default 30s. */
  timeoutMs?: number;
}

export type QueueFactory = (
  jobs: JobDefinition[],
  options: { worker: boolean },
) => JobQueue | Promise<JobQueue>;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Runs due jobs until none are left, for providers that pick a retry up on the next pass. */
async function drain(queue: JobQueue, passes = 10) {
  const total = { completed: 0, failed: 0 };
  for (let pass = 0; pass < passes; pass++) {
    const { completed, failed } = await queue.runDue();
    total.completed += completed;
    total.failed += failed;
    if (completed + failed === 0 && pass > 0) break;
    await sleep(200);
  }
  return total;
}

async function until<T>(read: () => Promise<T>, done: (value: T) => boolean, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (done(value)) return value;
    if (Date.now() > deadline) throw new Error("Timed out waiting for the job.");
    await sleep(200);
  }
}

/** Unique names, so providers that keep state between tests (a shared Redis) never mix them up. */
let counter = 0;
const unique = (name: string) => `${name}-${Date.now().toString(36)}-${counter++}`;

export function describeJobQueue(
  provider: string,
  create: QueueFactory,
  options: ConformanceOptions = {},
) {
  const timeout = options.timeoutMs ?? 30_000;
  const suite = options.skip ? describe.skip : describe;
  const queues: JobQueue[] = [];
  const open = async (jobs: JobDefinition[], worker = false) => {
    const queue = await create(jobs, { worker });
    queues.push(queue);
    return queue;
  };

  suite(`JobQueue conformance: ${provider}`, () => {
    afterEach(async () => {
      await Promise.all(queues.splice(0).map((queue) => queue.stop()));
    });

    it(
      "runs a due job and records its output and one attempt",
      async () => {
        const greet = defineJob<{ name: string }>({
          name: unique("greet"),
          run: async ({ name }) => ({ greeting: `Hello, ${name}` }),
        });
        const queue = await open([greet]);
        const id = await queue.enqueue(greet, { name: "Ada" });
        expect(id).toBeTruthy();
        expect((await queue.recent(greet))[0]).toMatchObject({
          id,
          name: greet.name,
          state: "queued",
          attempts: 0,
          data: { name: "Ada" },
        });

        expect(await drain(queue)).toEqual({ completed: 1, failed: 0 });
        const [job] = await queue.recent(greet);
        expect(job).toMatchObject({
          id,
          state: "completed",
          attempts: 1,
          output: { greeting: "Hello, Ada" },
        });
        expect(job!.completedAt).toBeInstanceOf(Date);
        expect(job!.createdAt).toBeInstanceOf(Date);
      },
      timeout,
    );

    it(
      "stores a value that isn't an object as { value }",
      async () => {
        const answer = defineJob({ name: unique("answer"), run: async () => 42 });
        const queue = await open([answer]);
        await queue.enqueue(answer, {});
        await drain(queue);
        expect((await queue.recent(answer))[0]).toMatchObject({
          state: "completed",
          output: { value: 42 },
        });
      },
      timeout,
    );

    it(
      "passes the job id and the attempt number to run",
      async () => {
        const seen: Array<{ id: string; attempt: number }> = [];
        const flaky = defineJob({
          name: unique("context"),
          retryLimit: 1,
          retryDelaySeconds: 0,
          run: async (_data, { id, attempt }) => {
            seen.push({ id, attempt });
            if (attempt === 1) throw new Error("first attempt fails");
            return { ok: true };
          },
        });
        const queue = await open([flaky]);
        const id = await queue.enqueue(flaky, {});
        await drain(queue);
        expect(seen.map((call) => call.attempt)).toEqual([1, 2]);
        expect(seen.every((call) => call.id === id)).toBe(true);
        expect((await queue.recent(flaky))[0]).toMatchObject({ state: "completed", attempts: 2 });
      },
      timeout,
    );

    it(
      "retries a failing job until retryLimit, then fails it with the error's message",
      async () => {
        let calls = 0;
        const broken = defineJob({
          name: unique("broken"),
          retryLimit: 2,
          retryDelaySeconds: 0,
          run: async () => {
            calls++;
            throw new Error("boom");
          },
        });
        const queue = await open([broken]);
        await queue.enqueue(broken, {});
        // runDue counts every failed attempt, retries included.
        expect(await drain(queue)).toEqual({ completed: 0, failed: 3 });
        expect(calls).toBe(3);
        expect((await queue.recent(broken))[0]).toMatchObject({
          state: "failed",
          attempts: 3,
          output: { message: "boom" },
        });
      },
      timeout,
    );

    it(
      "waits delaySeconds before a job is due",
      async () => {
        const later = defineJob({ name: unique("later"), run: async () => ({ ok: true }) });
        const queue = await open([later]);
        await queue.enqueue(later, {}, { delaySeconds: 3600 });
        expect(await queue.runDue()).toEqual({ completed: 0, failed: 0 });
        expect((await queue.recent(later))[0]?.state).toBe("queued");
      },
      timeout,
    );

    it(
      "accepts one job per key within throttleSeconds",
      async () => {
        const ping = defineJob({ name: unique("ping"), run: async () => null });
        const queue = await open([ping]);
        expect(await queue.enqueue(ping, {}, { key: "ada", throttleSeconds: 60 })).toBeTruthy();
        expect(await queue.enqueue(ping, {}, { key: "ada", throttleSeconds: 60 })).toBeNull();
        expect(await queue.enqueue(ping, {}, { key: "grace", throttleSeconds: 60 })).toBeTruthy();
      },
      timeout,
    );

    it(
      "lists a job's runs newest first, filtered by data, up to the limit",
      async () => {
        const note = defineJob<{ user: string; n: number }>({
          name: unique("note"),
          run: async () => null,
        });
        const queue = await open([note]);
        for (let n = 1; n <= 3; n++) {
          await queue.enqueue(note, { user: "ada", n });
          await sleep(20);
        }
        await queue.enqueue(note, { user: "grace", n: 9 });
        const ada = await queue.recent(note, { data: { user: "ada" }, limit: 2 });
        expect(ada.map((job: JobRecord) => (job.data as { n: number }).n)).toEqual([3, 2]);
        expect((await queue.recent(note, { data: { user: "grace" } })).length).toBe(1);
      },
      timeout,
    );

    it(
      "fails an attempt that runs past timeoutSeconds, and aborts its signal",
      async () => {
        let aborted = false;
        const slow = defineJob({
          name: unique("slow"),
          retryLimit: 0,
          timeoutSeconds: 1,
          run: (_data, { signal }) =>
            new Promise((_resolve, reject) => {
              signal.addEventListener("abort", () => {
                aborted = true;
                reject(new Error("aborted"));
              });
            }),
        });
        const queue = await open([slow]);
        await queue.enqueue(slow, {});
        expect(await drain(queue)).toEqual({ completed: 0, failed: 1 });
        expect(aborted).toBe(true);
        expect((await queue.recent(slow))[0]?.state).toBe("failed");
      },
      timeout,
    );

    it(
      "runs jobs in a worker",
      async () => {
        const work = defineJob({ name: unique("work"), run: async () => ({ done: true }) });
        const queue = await open([work], true);
        await queue.startWorker();
        await queue.enqueue(work, {});
        const [job] = await until(
          () => queue.recent(work),
          (jobs) => jobs[0]?.state === "completed",
          timeout - 2_000,
        );
        expect(job).toMatchObject({ output: { done: true } });
      },
      timeout,
    );

    it(
      "refuses a job that isn't defined",
      async () => {
        const known = defineJob({ name: unique("known"), run: async () => null });
        const stranger = defineJob({ name: unique("stranger"), run: async () => null });
        const queue = await open([known]);
        await expect(queue.enqueue(stranger, {})).rejects.toThrow(/not defined/);
      },
      timeout,
    );
  });
}

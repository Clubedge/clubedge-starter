// The provider-neutral contract. Each provider package (pg-boss today) implements JobQueue, so
// job definitions, routes, and pages never depend on one queue library.

export interface JobContext {
  id: string;
  /** 1 on the first run, 2 on the first retry, and so on. */
  attempt: number;
  /** Aborted when the job runs past its timeout or the worker stops. */
  signal: AbortSignal;
}

export interface JobDefinition<T extends object = object> {
  /** The queue name: letters, digits, dashes, underscores, and dots. */
  name: string;
  /** Does the work. A thrown error fails the attempt, and the job is retried until retryLimit. */
  run(data: T, context: JobContext): Promise<unknown>;
  /** Retries after a failed attempt. Default 2. */
  retryLimit?: number;
  /** Seconds before a retry; doubles with each attempt when retryBackoff is set. Default 10. */
  retryDelaySeconds?: number;
  retryBackoff?: boolean;
  /** Seconds an attempt may run before it is failed and retried. Default 300. */
  timeoutSeconds?: number;
  /** A cron expression, such as "0 3 * * *", to run the job on a schedule with empty data. */
  schedule?: string;
}

/** Declares a job with typed data. */
export function defineJob<T extends object>(definition: JobDefinition<T>): JobDefinition<T> {
  return definition;
}

export type JobState = "queued" | "active" | "retrying" | "completed" | "failed" | "cancelled";

export interface JobRecord {
  id: string;
  name: string;
  state: JobState;
  data: unknown;
  /** What run() returned, or the error of the last failed attempt. */
  output: unknown;
  attempts: number;
  createdAt: Date;
  completedAt: Date | null;
}

export interface EnqueueOptions {
  /** Waits this many seconds before the job can run. */
  delaySeconds?: number;
  /** With throttleSeconds: at most one job with this key is accepted per window. */
  key?: string;
  throttleSeconds?: number;
}

/** Application code depends on this interface, never on a queue library. */
export interface JobQueue {
  /** Stored nowhere, but useful in logs, such as "pg-boss". */
  readonly id: string;
  /** Adds a job and returns its id, or null when a throttled job with the same key exists. */
  enqueue<T extends object>(
    job: JobDefinition<T>,
    data: T,
    options?: EnqueueOptions,
  ): Promise<string | null>;
  /** Starts running jobs and schedules in this process until stop(). */
  startWorker(): Promise<void>;
  /**
   * Runs the jobs that are due now and returns, for platforms without long-running processes:
   * call it from a scheduled request instead of starting a worker. `completed` counts the jobs that
   * finished, and `failed` every attempt that failed, retries included.
   */
  runDue(options?: { limit?: number }): Promise<{ completed: number; failed: number }>;
  /** A job's most recent runs, newest first, optionally only those whose data contains `data`. */
  recent(job: JobDefinition, filter?: { data?: object; limit?: number }): Promise<JobRecord[]>;
  stop(): Promise<void>;
}

export const JOB_DEFAULTS = { retryLimit: 2, retryDelaySeconds: 10, timeoutSeconds: 300 };

/** How a job's result is stored: an object as it is, any other value as { value }, none as null. */
export function jobOutput(value: unknown): object | null {
  if (value === undefined || value === null) return null;
  return typeof value === "object" ? value : { value };
}

/** How a failed attempt is stored: the error's message. */
export function errorOutput(error: unknown): { message: string } {
  return { message: error instanceof Error ? error.message : String(error) };
}

/**
 * Runs one attempt of a job, the way every provider must: the signal aborts after timeoutSeconds
 * (or with `signal`, when the provider cancels it), and the attempt fails then, even when run()
 * ignores the signal. Resolves to the stored output; rejects with the attempt's error.
 */
export async function runAttempt<T extends object>(
  definition: JobDefinition<T>,
  data: T,
  context: { id: string; attempt: number; signal?: AbortSignal },
): Promise<object | null> {
  const seconds = definition.timeoutSeconds ?? JOB_DEFAULTS.timeoutSeconds;
  const timeout = AbortSignal.timeout(seconds * 1000);
  const signal = context.signal ? AbortSignal.any([context.signal, timeout]) : timeout;
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () =>
      reject(
        signal.reason instanceof Error
          ? signal.reason
          : new Error(`The job "${definition.name}" was stopped.`),
      );
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    const run = definition.run(data, { id: context.id, attempt: context.attempt, signal });
    return jobOutput(await Promise.race([run, aborted]));
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}

interface MemoryJob extends JobRecord {
  runAfter: number;
  key?: string;
}

/**
 * Runs jobs in this process and keeps them in memory, for tests. Retries happen immediately in
 * runDue; startWorker polls every pollMs.
 */
export function createMemoryJobs(
  definitions: readonly JobDefinition[],
  { pollMs = 50, now = () => Date.now() }: { pollMs?: number; now?: () => number } = {},
): JobQueue & { jobs: JobRecord[] } {
  const byName = new Map(definitions.map((definition) => [definition.name, definition]));
  const jobs: MemoryJob[] = [];
  let timer: ReturnType<typeof setInterval> | undefined;
  let nextId = 1;

  async function runOne(job: MemoryJob) {
    const definition = byName.get(job.name)!;
    const retryLimit = definition.retryLimit ?? JOB_DEFAULTS.retryLimit;
    job.state = "active";
    job.attempts += 1;
    try {
      job.output = await runAttempt(definition, job.data as object, {
        id: job.id,
        attempt: job.attempts,
      });
      job.state = "completed";
      job.completedAt = new Date(now());
      return true;
    } catch (error) {
      job.output = errorOutput(error);
      job.state = job.attempts > retryLimit ? "failed" : "retrying";
      if (job.state === "failed") job.completedAt = new Date(now());
      return false;
    }
  }

  async function runDue({ limit = Infinity }: { limit?: number } = {}) {
    let completed = 0;
    let failed = 0;
    for (let run = 0; run < limit; run++) {
      const job = jobs.find(
        (candidate) =>
          (candidate.state === "queued" || candidate.state === "retrying") &&
          candidate.runAfter <= now(),
      );
      if (!job) break;
      if (await runOne(job)) completed++;
      else failed++;
    }
    return { completed, failed };
  }

  return {
    id: "memory",
    jobs,

    async enqueue(definition, data, options = {}) {
      if (!byName.has(definition.name))
        throw new Error(`The job "${definition.name}" is not defined.`);
      if (options.key && options.throttleSeconds) {
        const since = now() - options.throttleSeconds * 1000;
        const taken = jobs.some(
          (job) =>
            job.name === definition.name &&
            job.key === options.key &&
            job.createdAt.getTime() > since,
        );
        if (taken) return null;
      }
      const job: MemoryJob = {
        id: String(nextId++),
        name: definition.name,
        state: "queued",
        data,
        output: null,
        attempts: 0,
        createdAt: new Date(now()),
        completedAt: null,
        runAfter: now() + (options.delaySeconds ?? 0) * 1000,
        key: options.key,
      };
      jobs.push(job);
      return job.id;
    },

    async startWorker() {
      timer ??= setInterval(() => void runDue(), pollMs);
    },

    runDue,

    async recent(definition, { data, limit = 10 } = {}) {
      const matches = (job: JobRecord) =>
        !data ||
        Object.entries(data).every(
          ([key, value]) => (job.data as Record<string, unknown>)[key] === value,
        );
      return jobs
        .filter((job) => job.name === definition.name && matches(job))
        .reverse()
        .slice(0, limit)
        .map(({ id, name, state, data, output, attempts, createdAt, completedAt }) => ({
          id,
          name,
          state,
          data,
          output,
          attempts,
          createdAt,
          completedAt,
        }));
    },

    async stop() {
      clearInterval(timer);
      timer = undefined;
    },
  };
}

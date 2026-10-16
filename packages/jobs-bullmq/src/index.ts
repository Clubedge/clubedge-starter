import { randomUUID } from "node:crypto";
import { Queue, Worker, type Job, type JobsOptions } from "bullmq";
import { Redis } from "ioredis";
import {
  JOB_DEFAULTS,
  errorOutput,
  runAttempt,
  type JobDefinition,
  type JobQueue,
  type JobRecord,
  type JobState,
} from "@clubedge/jobs";

export interface BullMqJobsConfig {
  /** A Redis URL; rediss:// enables TLS. Each worker opens its own connection, as BullMQ needs. */
  redisUrl: string;
  jobs: readonly JobDefinition[];
  /** Whether this process may run a worker. Processes that only enqueue, or call runDue, leave it off. */
  worker?: boolean;
  /** The Redis key prefix for BullMQ's keys. Default "clubedge". */
  prefix?: string;
  /** Jobs each worker runs at once. Default 1. */
  concurrency?: number;
  /** Receives BullMQ's own errors, and each failed job attempt with the job's name. */
  onError?: (error: unknown, context?: { job: string; attempt: number }) => void;
}

// Finished jobs stay listed for a week (completed) or a month (failed), at most this many each.
const KEEP_COMPLETED = { age: 7 * 24 * 3600, count: 1000 };
const KEEP_FAILED = { age: 30 * 24 * 3600, count: 1000 };

// recent() reads each state's list and labels its jobs with that state.
const LISTS: Array<{
  type: "waiting" | "prioritized" | "delayed" | "active" | "completed" | "failed";
  state: (job: Job) => JobState;
}> = [
  { type: "active", state: () => "active" },
  { type: "waiting", state: (job) => (job.attemptsMade > 0 ? "retrying" : "queued") },
  { type: "prioritized", state: (job) => (job.attemptsMade > 0 ? "retrying" : "queued") },
  { type: "delayed", state: (job) => (job.attemptsMade > 0 ? "retrying" : "queued") },
  { type: "completed", state: () => "completed" },
  { type: "failed", state: () => "failed" },
];

/** Jobs stored in Redis through BullMQ, behind JobQueue. */
export function createBullMqJobs({
  redisUrl,
  jobs: definitions,
  worker = false,
  prefix = "clubedge",
  concurrency = 1,
  onError = (error, context) =>
    console.error(context ? `Background job "${context.job}" failed:` : "Background jobs:", error),
}: BullMqJobsConfig): JobQueue & { queues: Map<string, Queue> } {
  if (!redisUrl) throw new Error("Background jobs need a Redis URL.");
  const byName = new Map(definitions.map((definition) => [definition.name, definition]));
  const connections: Redis[] = [];
  /** A connection; workers block on theirs, so BullMQ requires maxRetriesPerRequest: null there. */
  const connect = (blocking: boolean) => {
    const connection = new Redis(redisUrl, {
      ...(blocking ? { maxRetriesPerRequest: null } : { maxRetriesPerRequest: 3 }),
      connectTimeout: 10_000,
    });
    // Without a listener, a connection error would crash Node.
    connection.on("error", (error) => onError(error));
    connections.push(connection);
    return connection;
  };
  let shared: Redis | undefined;
  const queues = new Map<string, Queue>();
  const workers: Worker[] = [];
  let working: Promise<void> | undefined;

  function definitionFor(name: string) {
    const definition = byName.get(name);
    if (!definition) throw new Error(`The job "${name}" is not defined.`);
    return definition;
  }

  function queueFor(definition: JobDefinition) {
    let queue = queues.get(definition.name);
    if (!queue) {
      shared ??= connect(false);
      queue = new Queue(definition.name, { connection: shared, prefix });
      queue.on("error", (error) => onError(error));
      queues.set(definition.name, queue);
    }
    return queue;
  }

  /** The retry and retention settings a definition gives each of its jobs. */
  const jobOptions = (definition: JobDefinition): JobsOptions => {
    const delay = (definition.retryDelaySeconds ?? JOB_DEFAULTS.retryDelaySeconds) * 1000;
    return {
      attempts: (definition.retryLimit ?? JOB_DEFAULTS.retryLimit) + 1,
      backoff: { type: definition.retryBackoff ? "exponential" : "fixed", delay },
      removeOnComplete: KEEP_COMPLETED,
      removeOnFail: KEEP_FAILED,
    };
  };

  /** Starts or stops each definition's cron schedule; BullMQ keeps one scheduler per job. */
  async function syncSchedules() {
    for (const definition of definitions) {
      const queue = queueFor(definition);
      if (definition.schedule) {
        await queue.upsertJobScheduler(
          definition.name,
          { pattern: definition.schedule, tz: "UTC" },
          { name: definition.name, data: {}, opts: jobOptions(definition) },
        );
      } else {
        await queue.removeJobScheduler(definition.name);
      }
    }
  }

  async function execute(definition: JobDefinition, job: Job, signal?: AbortSignal) {
    const attempt = job.attemptsMade + 1;
    try {
      return await runAttempt(definition, job.data as object, { id: job.id!, attempt, signal });
    } catch (error) {
      // A failing error reporter must not replace the job's own error.
      try {
        onError(error, { job: definition.name, attempt });
      } catch (reportFailure) {
        console.error("Background jobs: onError failed", reportFailure);
      }
      throw error;
    }
  }

  const toRecord = (job: Job, state: JobState): JobRecord => ({
    id: job.id!,
    name: job.name,
    state,
    data: job.data,
    output:
      state === "completed"
        ? (job.returnvalue ?? null)
        : job.failedReason && (state === "failed" || state === "retrying")
          ? errorOutput(job.failedReason)
          : null,
    attempts: job.attemptsStarted ?? job.attemptsMade,
    createdAt: new Date(job.timestamp),
    completedAt:
      state === "completed" || state === "failed"
        ? new Date(job.finishedOn ?? job.timestamp)
        : null,
  });

  return {
    id: "bullmq",
    queues,

    async enqueue(definition, data, { delaySeconds, key, throttleSeconds } = {}) {
      definitionFor(definition.name);
      const jobId = randomUUID();
      const job = await queueFor(definition).add(definition.name, data, {
        ...jobOptions(definition),
        jobId,
        ...(delaySeconds ? { delay: delaySeconds * 1000 } : {}),
        // A key alone allows one unfinished job per key; with throttleSeconds, one per window.
        ...(key
          ? {
              deduplication: {
                id: `${definition.name}:${key}`,
                ...(throttleSeconds ? { ttl: throttleSeconds * 1000 } : {}),
              },
            }
          : {}),
      });
      // A deduplicated add returns the job that is already there.
      return job.id === jobId ? jobId : null;
    },

    async startWorker() {
      if (!worker) throw new Error("Create the queue with worker: true to run a worker.");
      working ??= (async () => {
        await syncSchedules();
        for (const definition of definitions) {
          const instance = new Worker(
            definition.name,
            (job, _token, signal) => execute(definition, job, signal),
            {
              connection: connect(true),
              prefix,
              concurrency,
              removeOnComplete: KEEP_COMPLETED,
              removeOnFail: KEEP_FAILED,
            },
          );
          instance.on("error", (error) => onError(error));
          workers.push(instance);
        }
      })().catch((error: unknown) => {
        working = undefined;
        throw error;
      });
      return working;
    },

    async runDue({ limit = 25 } = {}) {
      await syncSchedules();
      let completed = 0;
      let failed = 0;
      for (const definition of definitions) {
        if (completed + failed >= limit) break;
        // A worker without a processor: this process fetches and finishes each job itself.
        const manual = new Worker(definition.name, null, {
          connection: connect(true),
          prefix,
          autorun: false,
        });
        manual.on("error", (error) => onError(error));
        const token = randomUUID();
        try {
          while (completed + failed < limit) {
            const job = (await manual.getNextJob(token, { block: false })) as Job | undefined;
            if (!job) break;
            // The lock expires after 30 seconds unless it is extended while the job runs.
            const lock = setInterval(
              () => void job.extendLock(token, 30_000).catch(() => {}),
              10_000,
            );
            try {
              const output = await execute(definition, job);
              await job.moveToCompleted(output, token, false);
              completed++;
            } catch (error) {
              // Retries and backoff still apply: BullMQ moves the job back to waiting or delayed.
              await job.moveToFailed(
                error instanceof Error ? error : new Error(String(error)),
                token,
                false,
              );
              failed++;
            } finally {
              clearInterval(lock);
            }
          }
        } finally {
          await manual.close();
        }
      }
      return { completed, failed };
    },

    async recent(definition, { data, limit = 10 } = {}) {
      const queue = queueFor(definition);
      const matches = (job: Job) =>
        !data ||
        Object.entries(data).every(
          ([key, value]) => (job.data as Record<string, unknown>)?.[key] === value,
        );
      const records: JobRecord[] = [];
      for (const { type, state } of LISTS) {
        for (const job of await queue.getJobs([type], 0, 199, false)) {
          if (job && job.name === definition.name && matches(job))
            records.push(toRecord(job, state(job)));
        }
      }
      return records.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
    },

    async stop() {
      await Promise.all(workers.splice(0).map((instance) => instance.close()));
      await Promise.all([...queues.values()].map((queue) => queue.close()));
      queues.clear();
      await Promise.all(
        connections
          .splice(0)
          .map((connection) => connection.quit().catch(() => connection.disconnect())),
      );
      shared = undefined;
      working = undefined;
    },
  };
}

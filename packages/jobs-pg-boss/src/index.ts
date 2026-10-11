import { PgBoss, type Db, type Job, type JobWithMetadata } from "pg-boss";
import {
  JOB_DEFAULTS,
  type JobDefinition,
  type JobQueue,
  type JobRecord,
  type JobState,
} from "@clubedge/jobs";

export { fromPglite } from "pg-boss";

export interface PgBossJobsConfig {
  /** A PostgreSQL connection string; pg-boss opens its own small pool. */
  connectionString?: string;
  /** Or an existing connection instead, such as fromPglite(pglite) in tests. */
  db?: Db;
  /** "pglite" when db is an in-process PGlite. */
  backend?: "postgres" | "pglite";
  jobs: readonly JobDefinition[];
  /**
   * Whether this process may run a worker: it then also expires stuck jobs and starts
   * schedules. Processes that only enqueue, or call runDue, leave it off.
   */
  worker?: boolean;
  /** The PostgreSQL schema for pg-boss's tables. Default "pgboss". */
  schema?: string;
  maxConnections?: number;
  /** How often an idle worker checks for new jobs. Default 2 seconds. */
  pollingIntervalSeconds?: number;
  onError?: (error: Error) => void;
}

const STATES: Record<JobWithMetadata["state"], JobState> = {
  created: "queued",
  retry: "retrying",
  active: "active",
  completed: "completed",
  cancelled: "cancelled",
  failed: "failed",
};

/** pg-boss stores outputs as JSON objects. */
const toOutput = (value: unknown): object | null =>
  value === undefined || value === null ? null : typeof value === "object" ? value : { value };

const errorOutput = (error: unknown) => ({
  message: error instanceof Error ? error.message : String(error),
});

/** Jobs stored in PostgreSQL through pg-boss, behind JobQueue. */
export function createPgBossJobs({
  connectionString,
  db,
  backend,
  jobs: definitions,
  worker = false,
  schema = "pgboss",
  maxConnections = 4,
  pollingIntervalSeconds = 2,
  onError = (error) => console.error("Background jobs:", error),
}: PgBossJobsConfig): JobQueue & { boss: PgBoss } {
  if (!connectionString && !db) throw new Error("Background jobs need a connectionString or db.");
  const byName = new Map(definitions.map((definition) => [definition.name, definition]));
  const boss = new PgBoss({
    // Without a connection timeout, an unreachable database would leave callers waiting forever.
    ...(db ? { db } : { connectionString, max: maxConnections, connectionTimeoutMillis: 10_000 }),
    ...(backend ? { backend } : {}),
    schema,
    application_name: "clubedge-jobs",
    supervise: worker,
    schedule: worker,
  });
  // pg-boss reports background failures as events; without a listener they would crash Node.
  boss.on("error", onError);

  let ready: Promise<void> | undefined;
  let working: Promise<void> | undefined;

  /** Starts pg-boss once (creating or migrating its schema) and creates each job's queue. */
  function start() {
    ready ??= (async () => {
      await boss.start();
      for (const definition of definitions) {
        const options = {
          retryLimit: definition.retryLimit ?? JOB_DEFAULTS.retryLimit,
          retryDelay: definition.retryDelaySeconds ?? JOB_DEFAULTS.retryDelaySeconds,
          retryBackoff: definition.retryBackoff ?? false,
          expireInSeconds: definition.timeoutSeconds ?? JOB_DEFAULTS.timeoutSeconds,
        };
        if (await boss.getQueue(definition.name)) await boss.updateQueue(definition.name, options);
        else await boss.createQueue(definition.name, options);
      }
    })().catch((error: unknown) => {
      ready = undefined;
      throw error;
    });
    return ready;
  }

  function definitionFor(name: string) {
    const definition = byName.get(name);
    if (!definition) throw new Error(`The job "${name}" is not defined.`);
    return definition;
  }

  async function execute(definition: JobDefinition, job: Job<object>) {
    const timeout = (definition.timeoutSeconds ?? JOB_DEFAULTS.timeoutSeconds) * 1000;
    return toOutput(
      await definition.run(job.data, {
        id: job.id,
        attempt: job.retryCount + 1,
        signal: job.signal ?? AbortSignal.timeout(timeout),
      }),
    );
  }

  const toRecord = (job: JobWithMetadata<object>): JobRecord => ({
    id: job.id,
    name: job.name,
    state: STATES[job.state],
    data: job.data,
    output: job.output ?? null,
    attempts: job.state === "created" ? 0 : job.retryCount + 1,
    createdAt: new Date(job.createdOn),
    completedAt: job.completedOn ? new Date(job.completedOn) : null,
  });

  return {
    id: "pg-boss",
    boss,

    async enqueue(definition, data, { delaySeconds, key, throttleSeconds } = {}) {
      definitionFor(definition.name);
      await start();
      return boss.send(definition.name, data, {
        ...(delaySeconds ? { startAfter: delaySeconds } : {}),
        ...(key ? { singletonKey: key } : {}),
        ...(key && throttleSeconds ? { singletonSeconds: throttleSeconds } : {}),
      });
    },

    async startWorker() {
      if (!worker) throw new Error("Create the queue with worker: true to run a worker.");
      working ??= (async () => {
        await start();
        for (const definition of definitions) {
          await boss.work<object>(
            definition.name,
            { pollingIntervalSeconds, batchSize: 1 },
            async ([job]) => execute(definition, job!),
          );
          if (definition.schedule) await boss.schedule(definition.name, definition.schedule, {});
          else await boss.unschedule(definition.name);
        }
      })().catch((error: unknown) => {
        working = undefined;
        throw error;
      });
      return working;
    },

    async runDue({ limit = 25 } = {}) {
      await start();
      // Without a worker nothing else expires stuck jobs or schedules retries.
      await boss.supervise();
      let completed = 0;
      let failed = 0;
      for (const definition of definitions) {
        while (completed + failed < limit) {
          const [job] = await boss.fetch<object>(definition.name, { batchSize: 1 });
          if (!job) break;
          try {
            await boss.complete(definition.name, job, await execute(definition, job));
            completed++;
          } catch (error) {
            await boss.fail(definition.name, job, errorOutput(error));
            failed++;
          }
        }
      }
      return { completed, failed };
    },

    async recent(definition, { data, limit = 10 } = {}) {
      await start();
      const rows = await boss.findJobs<object>(definition.name, data ? { data } : {});
      return rows
        .map(toRecord)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limit);
    },

    async stop() {
      if (!ready) return;
      await boss.stop({ graceful: true, timeout: 10_000 });
      ready = undefined;
      working = undefined;
    },
  };
}

import { randomUUID } from "node:crypto";
import { Inngest, RetryAfterError } from "inngest";
import { serve } from "inngest/edge";
import {
  JOB_DEFAULTS,
  errorOutput,
  runAttempt,
  type JobDefinition,
  type JobQueue,
  type JobRecord,
  type JobState,
} from "@clubedge/jobs";

// Inngest runs jobs itself: the app sends an event per job, and Inngest calls the app's
// /api/inngest endpoint (handler below) to run it, with retries and cron schedules. Nothing runs
// in this process between requests, so startWorker and runDue have no work to do.

export interface InngestJobsConfig {
  jobs: readonly JobDefinition[];
  /** The Inngest app id, shown in the Inngest dashboard. Default "clubedge". */
  appId?: string;
  /** INNGEST_EVENT_KEY: sends events in production. */
  eventKey?: string;
  /** INNGEST_SIGNING_KEY: signs Inngest's calls to the app, and authorizes reading runs. */
  signingKey?: string;
  /**
   * The local Inngest Dev Server: true for http://localhost:8288, or its URL. Unset (production),
   * the app talks to Inngest Cloud with the keys above.
   */
  dev?: boolean | string;
  /**
   * The public origin Inngest reaches the app at, such as https://app.example.com, when a proxy
   * in front of the app changes the host or protocol it sees. Default: the request's own URL.
   */
  serveOrigin?: string;
  /** Receives each failed job attempt with the job's name. */
  onError?: (error: unknown, context?: { job: string; attempt: number }) => void;
  /** For tests: the fetch used for Inngest's REST API. */
  fetch?: typeof fetch;
}

/** The event that runs a job. */
export const eventName = (job: string) => `clubedge/${job}`;

const KEY = "__clubedgeKey";
/** An event's data without the throttle key enqueue adds to it. */
function withoutKey(data: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const copy = { ...(data ?? {}) };
  delete copy[KEY];
  return copy;
}
type Retries =
  0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20;
const DAY = 24 * 3600 * 1000;

interface ApiEvent {
  internal_id: string;
  id: string;
  name: string;
  data: Record<string, unknown> | null;
  /** The Dev Server and the API return received_at; the published spec says receivedAt. */
  received_at?: string;
  receivedAt?: string;
}
interface ApiRun {
  run_id: string;
  run_started_at: string;
  ended_at: string | null;
  /** Running, Completed, Failed, or Cancelled. */
  status: string;
  output: unknown;
}

const STATES: Record<string, JobState> = {
  running: "active",
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
  canceled: "cancelled",
};

/** A run's state; one Inngest hasn't started yet (Scheduled, Queued, ...) counts as queued. */
const runState = (status: string): JobState => STATES[status.toLowerCase()] ?? "queued";

const receivedAt = (event: ApiEvent) => Date.parse(event.received_at ?? event.receivedAt ?? "");

/** Jobs enqueued here stay listed this long, until Inngest's API lists their events. */
const PENDING_MS = 60_000;

/** A failed run's output holds the error; keep its message, as other providers store it. */
function failedOutput(output: unknown) {
  const value = output as { error?: { message?: unknown }; message?: unknown } | null;
  const message = value?.error?.message ?? value?.message;
  return errorOutput(typeof message === "string" ? message : "The job failed.");
}

/** Jobs run by Inngest, behind JobQueue, plus the request handler Inngest calls. */
export function createInngestJobs({
  jobs: definitions,
  appId = "clubedge",
  eventKey,
  signingKey,
  dev,
  serveOrigin,
  onError = (error, context) =>
    console.error(context ? `Background job "${context.job}" failed:` : "Background jobs:", error),
  fetch: fetcher = fetch,
}: InngestJobsConfig): JobQueue & {
  client: Inngest;
  handler: (request: Request) => Promise<Response>;
} {
  const byName = new Map(definitions.map((definition) => [definition.name, definition]));
  const devUrl =
    dev === true
      ? "http://localhost:8288"
      : typeof dev === "string" && dev
        ? dev.replace(/\/$/, "")
        : null;
  const client = new Inngest({
    id: appId,
    ...(eventKey ? { eventKey } : {}),
    ...(signingKey ? { signingKey } : {}),
    ...(devUrl ? { isDev: true, baseUrl: devUrl } : { isDev: false }),
    fetch: fetcher,
  });
  const apiUrl = devUrl ?? "https://api.inngest.com";

  const functions = definitions.map((definition) => {
    // Inngest allows 0 to 20 retries.
    const retryLimit = Math.max(
      0,
      Math.min(definition.retryLimit ?? JOB_DEFAULTS.retryLimit, 20),
    ) as Retries;
    const delaySeconds = definition.retryDelaySeconds ?? JOB_DEFAULTS.retryDelaySeconds;
    return client.createFunction(
      {
        id: definition.name,
        retries: retryLimit,
        triggers: [
          { event: eventName(definition.name) },
          ...(definition.schedule ? [{ cron: `TZ=UTC ${definition.schedule}` }] : []),
        ],
      },
      async ({ event, attempt: retries, runId }) => {
        const attempt = retries + 1;
        const data = withoutKey(event.data as Record<string, unknown> | undefined);
        try {
          return await runAttempt(definition, data, { id: String(event.id ?? runId), attempt });
        } catch (error) {
          try {
            onError(error, { job: definition.name, attempt });
          } catch (reportFailure) {
            console.error("Background jobs: onError failed", reportFailure);
          }
          // Retry after the definition's delay, doubled per attempt with retryBackoff, rather than
          // Inngest's own schedule; the last attempt fails with the job's error.
          if (attempt <= retryLimit && delaySeconds > 0) {
            const seconds = delaySeconds * (definition.retryBackoff ? 2 ** (attempt - 1) : 1);
            throw new RetryAfterError(
              error instanceof Error ? error.message : String(error),
              new Date(Date.now() + seconds * 1000),
              {
                cause: error,
              },
            );
          }
          throw error;
        }
      },
    );
  });

  const handler = serve({ client, functions, ...(serveOrigin ? { serveOrigin } : {}) });
  const pending = new Map<
    string,
    { job: string; data: Record<string, unknown>; createdAt: Date }
  >();

  async function api<T>(path: string): Promise<T> {
    const response = await fetcher(`${apiUrl}${path}`, {
      headers: {
        accept: "application/json",
        ...(signingKey ? { authorization: `Bearer ${signingKey}` } : {}),
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok)
      throw new Error(`Inngest's API answered ${response.status} for ${path.split("?")[0]}.`);
    return ((await response.json()) as { data: T }).data;
  }

  /** The job's events received since `since`, newest first. */
  async function events(definition: JobDefinition, since: number): Promise<ApiEvent[]> {
    const query = new URLSearchParams({
      name: eventName(definition.name),
      received_after: new Date(since).toISOString(),
      limit: "100",
    });
    const list = await api<ApiEvent[]>(`/v1/events?${query}`);
    return list.sort((a, b) => receivedAt(b) - receivedAt(a));
  }

  return {
    id: "inngest",
    client,
    handler,

    async enqueue(definition, data, { delaySeconds, key, throttleSeconds } = {}) {
      definitionFor(definition.name);
      let id: string = randomUUID();
      if (key) {
        // Inngest drops a second event with the same id within 24 hours. With throttleSeconds, the
        // id names the window, and a recent event with the key means this one is throttled.
        const window = throttleSeconds ? throttleSeconds * 1000 : DAY;
        const recent = await events(definition, Date.now() - window).catch(() => []);
        if (recent.some((event) => event.data?.[KEY] === key)) return null;
        id = `${definition.name}:${key}:${Math.floor(Date.now() / window)}`;
      }
      await client.send({
        id,
        name: eventName(definition.name),
        data: { ...data, ...(key ? { [KEY]: key } : {}) },
        ...(delaySeconds ? { ts: Date.now() + delaySeconds * 1000 } : {}),
      });
      // Inngest lists an event a moment after it accepts it: remember the job until then, so the
      // page that queued it can already show it.
      pending.set(id, {
        job: definition.name,
        data: data as Record<string, unknown>,
        createdAt: new Date(),
      });
      return id;
    },

    // Inngest calls the app to run each job; there is no worker to start.
    async startWorker() {},

    async runDue() {
      return { completed: 0, failed: 0 };
    },

    async recent(definition, { data, limit = 10 } = {}) {
      const matches = (event: ApiEvent) =>
        !data || Object.entries(data).every(([key, value]) => event.data?.[key] === value);
      const found = (await events(definition, Date.now() - 7 * DAY))
        .filter(matches)
        .slice(0, limit);
      // Jobs this process enqueued that Inngest doesn't list yet, as queued.
      const listed = new Set(found.map((event) => event.id));
      const waiting: JobRecord[] = [];
      for (const [id, job] of pending) {
        if (listed.has(id) || Date.now() - job.createdAt.getTime() > PENDING_MS) {
          pending.delete(id);
          continue;
        }
        const wanted =
          !data || Object.entries(data).every(([key, value]) => job.data[key] === value);
        if (job.job === definition.name && wanted) {
          waiting.push({
            id,
            name: job.job,
            state: "queued",
            data: job.data,
            output: null,
            attempts: 0,
            createdAt: job.createdAt,
            completedAt: null,
          });
        }
      }
      const records = await Promise.all(
        found.map(async (event): Promise<JobRecord> => {
          const runs = await api<ApiRun[]>(
            `/v1/events/${encodeURIComponent(event.internal_id)}/runs`,
          ).catch(() => []);
          const run = runs.sort(
            (a, b) => Date.parse(b.run_started_at) - Date.parse(a.run_started_at),
          )[0];
          const state = run ? runState(run.status) : "queued";
          const eventData = withoutKey(event.data);
          return {
            id: event.id,
            name: definition.name,
            state,
            data: eventData,
            output: !run
              ? null
              : state === "completed"
                ? ((run.output as object | null) ?? null)
                : state === "failed"
                  ? failedOutput(run.output)
                  : null,
            // Inngest's API reports runs, not attempts: a finished or running job counts one.
            attempts: run ? 1 : 0,
            createdAt: new Date(receivedAt(event)),
            completedAt: run?.ended_at ? new Date(run.ended_at) : null,
          };
        }),
      );
      return [...waiting, ...records]
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limit);
    },

    async stop() {},
  };

  function definitionFor(name: string) {
    const definition = byName.get(name);
    if (!definition) throw new Error(`The job "${name}" is not defined.`);
    return definition;
  }
}

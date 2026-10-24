import { describe, expect, it } from "vitest";
import { defineJob } from "@clubedge/jobs";
import { createInngestJobs, eventName } from "./index";

// Inngest's Dev Server and API, faked: sending an event, listing events, and their runs.
function fakeInngest({
  events = [],
  runs = {},
}: { events?: object[]; runs?: Record<string, object[]> } = {}) {
  const sent: Array<Record<string, unknown>> = [];
  const requests: string[] = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    requests.push(`${init?.method ?? "GET"} ${url.pathname}${url.search}`);
    if (url.pathname.startsWith("/e/")) {
      const body = JSON.parse(String(init?.body));
      for (const event of [body].flat()) sent.push(event);
      return Response.json({ ids: sent.map((_, i) => `01H${i}`), status: 200 });
    }
    if (url.pathname === "/v1/events") return Response.json({ data: events, metadata: {} });
    const match = /^\/v1\/events\/([^/]+)\/runs$/.exec(url.pathname);
    if (match)
      return Response.json({ data: runs[decodeURIComponent(match[1]!)] ?? [], metadata: {} });
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  return { fetcher, sent, requests };
}

const greet = defineJob<{ user: string }>({
  name: "greet",
  run: async ({ user }) => ({ greeting: `Hello, ${user}` }),
});

describe("createInngestJobs", () => {
  it("sends one event per job, delayed with ts", async () => {
    const fake = fakeInngest();
    const queue = createInngestJobs({
      jobs: [greet],
      dev: "http://inngest.test",
      fetch: fake.fetcher,
    });
    const id = await queue.enqueue(greet, { user: "ada" }, { delaySeconds: 60 });
    expect(id).toBeTruthy();
    expect(fake.sent[0]).toMatchObject({ id, name: eventName("greet"), data: { user: "ada" } });
    expect(Number(fake.sent[0]!.ts)).toBeGreaterThan(Date.now() + 50_000);
  });

  it("throttles by key: a recent event with the key means null", async () => {
    const fresh = fakeInngest();
    const queue = createInngestJobs({
      jobs: [greet],
      dev: "http://inngest.test",
      fetch: fresh.fetcher,
    });
    const id = await queue.enqueue(greet, { user: "ada" }, { key: "ada", throttleSeconds: 60 });
    expect(id).toMatch(/^greet:ada:\d+$/);
    expect(fresh.sent[0]!.data).toMatchObject({ __clubedgeKey: "ada" });
    expect(fresh.requests[0]).toContain(
      `/v1/events?name=${encodeURIComponent(eventName("greet"))}`,
    );

    const taken = fakeInngest({
      events: [
        {
          internal_id: "e1",
          id: "x",
          name: eventName("greet"),
          data: { user: "ada", __clubedgeKey: "ada" },
          receivedAt: new Date().toISOString(),
        },
      ],
    });
    const throttled = createInngestJobs({
      jobs: [greet],
      dev: "http://inngest.test",
      fetch: taken.fetcher,
    });
    expect(
      await throttled.enqueue(greet, { user: "ada" }, { key: "ada", throttleSeconds: 60 }),
    ).toBeNull();
    expect(taken.sent).toHaveLength(0);
  });

  it("lists recent jobs from Inngest's events and runs", async () => {
    const at = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
    const fake = fakeInngest({
      events: [
        {
          internal_id: "e1",
          id: "j1",
          name: eventName("greet"),
          data: { user: "ada" },
          received_at: at(30),
        },
        {
          internal_id: "e2",
          id: "j2",
          name: eventName("greet"),
          data: { user: "ada", __clubedgeKey: "ada" },
          received_at: at(20),
        },
        {
          internal_id: "e3",
          id: "j3",
          name: eventName("greet"),
          data: { user: "ada" },
          receivedAt: at(10),
        },
        {
          internal_id: "e4",
          id: "j4",
          name: eventName("greet"),
          data: { user: "grace" },
          received_at: at(5),
        },
      ],
      runs: {
        e1: [
          {
            run_id: "r1",
            run_started_at: at(29),
            ended_at: at(28),
            status: "Completed",
            output: { greeting: "Hello, ada" },
          },
        ],
        e2: [
          {
            run_id: "r2",
            run_started_at: at(19),
            ended_at: at(18),
            status: "Failed",
            output: { error: { name: "Error", message: "boom" } },
          },
        ],
      },
    });
    const queue = createInngestJobs({ jobs: [greet], dev: true, fetch: fake.fetcher });
    const jobs = await queue.recent(greet, { data: { user: "ada" } });
    expect(jobs.map((job) => [job.id, job.state])).toEqual([
      ["j3", "queued"],
      ["j2", "failed"],
      ["j1", "completed"],
    ]);
    expect(jobs[1]).toMatchObject({
      output: { message: "boom" },
      data: { user: "ada" },
      attempts: 1,
    });
    expect(jobs[2]).toMatchObject({ output: { greeting: "Hello, ada" } });
    expect(jobs[0]).toMatchObject({ output: null, attempts: 0, completedAt: null });
    expect(
      (await queue.recent(greet, { data: { user: "ada" }, limit: 1 })).map((job) => job.id),
    ).toEqual(["j3"]);
  });

  it("lists a job it just enqueued before Inngest's API does", async () => {
    const fake = fakeInngest();
    const queue = createInngestJobs({ jobs: [greet], dev: true, fetch: fake.fetcher });
    const id = await queue.enqueue(greet, { user: "ada" });
    expect(await queue.recent(greet, { data: { user: "ada" } })).toMatchObject([
      { id, state: "queued", attempts: 0, data: { user: "ada" } },
    ]);
    expect(await queue.recent(greet, { data: { user: "grace" } })).toEqual([]);
  });

  it("has no worker to start and nothing to run on demand", async () => {
    const queue = createInngestJobs({ jobs: [greet], dev: true, fetch: fakeInngest().fetcher });
    await expect(queue.startWorker()).resolves.toBeUndefined();
    expect(await queue.runDue()).toEqual({ completed: 0, failed: 0 });
  });

  it("refuses a job that isn't defined", async () => {
    const queue = createInngestJobs({ jobs: [greet], dev: true, fetch: fakeInngest().fetcher });
    const stranger = defineJob({ name: "stranger", run: async () => null });
    await expect(queue.enqueue(stranger, {})).rejects.toThrow(/not defined/);
  });

  it("serves Inngest's endpoint with every job as a function", async () => {
    const queue = createInngestJobs({ jobs: [greet], dev: true, fetch: fakeInngest().fetcher });
    // The Dev Server reads this introspection to find the app's functions.
    const response = await queue.handler(
      new Request("http://localhost:3000/api/inngest", { headers: { host: "localhost:3000" } }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { function_count?: number };
    expect(body.function_count).toBe(1);
  });
  it("registers at serveOrigin when a proxy in front of the app changes its URL", async () => {
    const registered: string[] = [];
    const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      if (url.pathname === "/fn/register") {
        registered.push(String((JSON.parse(String(init?.body)) as { url?: string }).url));
        return Response.json({ ok: true, modified: true });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;
    const queue = createInngestJobs({
      jobs: [greet],
      dev: "http://inngest.test",
      serveOrigin: "http://127.0.0.1:3000",
      fetch: fetcher,
    });
    // The request as the API sees it, behind the frontend's proxy.
    await queue.handler(
      new Request("http://127.0.0.1:3001/api/inngest", {
        method: "PUT",
        headers: { host: "127.0.0.1:3001" },
      }),
    );
    expect(registered).toHaveLength(1);
    expect(registered[0]).toMatch(/^http:\/\/127\.0\.0\.1:3000\/api\/inngest/);
  });
});

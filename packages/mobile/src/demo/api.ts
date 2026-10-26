// The demo's API, in place of the app's (@/lib/api) in a demo build: the contract client, with a
// fetch that answers the routes the app calls from memory, so the demo needs no server.
import { createApiClient, type ApiError, type JobRun } from "@clubedge/contract";
import { demo, jobId } from "./state";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const refuse = (status: number, code: string, message: string) =>
  json(status, { error: { code, message } } satisfies ApiError);

const done = () => new Response(null, { status: 204 });

const signedOut = () => refuse(401, "unauthorized", "Sign in first.");

/** A sample job as the API lists it: queued, then completed half a second later. */
function jobRun({ id, createdAt }: { id: string; createdAt: number }): JobRun {
  const completed = Date.now() - createdAt >= 500;
  return {
    id,
    name: "sample",
    state: completed ? "completed" : "queued",
    createdAt: new Date(createdAt).toISOString(),
    completedAt: completed ? new Date(createdAt + 500).toISOString() : null,
  };
}

const routes: Record<string, (request: Request) => Response | Promise<Response>> = {
  "GET /api/health": () =>
    json(200, { status: "ok", service: "demo", timestamp: new Date().toISOString() }),
  "GET /api/ready": () => json(200, { status: "ok" }),
  "GET /api/session": () => json(200, { user: demo.user }),
  "GET /api/app-version": () =>
    json(200, {
      minimumVersion: null,
      latestVersion: null,
      updateUrl: null,
      nextMinimumVersion: null,
      nextMinimumFrom: null,
    }),
  "GET /api/account": () =>
    demo.user
      ? json(200, {
          email: demo.user.email,
          displayName: demo.displayName,
          canDeleteAccount: true,
        })
      : signedOut(),
  "POST /api/account/profile": async (request) => {
    if (!demo.user) return signedOut();
    const { displayName } = await request.json();
    const name = typeof displayName === "string" ? displayName.trim() : "";
    if (name.length > 80) {
      return refuse(400, "invalid_input", "A display name has up to 80 characters.");
    }
    demo.displayName = name || null;
    return done();
  },
  "POST /api/account/delete": async (request) => {
    if (!demo.user) return signedOut();
    const { password } = await request.json();
    if (typeof password !== "string" || !password) {
      return refuse(400, "invalid_input", "Enter your password.");
    }
    // Any password signs in, so any password deletes; the app then signs out.
    demo.user = null;
    demo.displayName = null;
    return done();
  },
  "GET /api/jobs": () => json(200, { runner: "worker", jobs: demo.jobs.slice(0, 5).map(jobRun) }),
  "POST /api/jobs/sample": () => {
    const job = { id: jobId(), createdAt: Date.now() };
    demo.jobs.unshift(job);
    return json(202, { id: job.id });
  },
  // Billing stays on the website: the app shows none.
  "GET /api/billing": () => json(200, { configured: false, plans: [], subscription: null }),
  "GET /api/client-errors": () => json(200, { provider: "none" }),
  "POST /api/client-errors": () => done(),
};

/** Answers a request to the API as the demo's server would, or 404 as for an absent module. */
async function answer(input: RequestInfo | URL, init?: RequestInit) {
  const request = new Request(input, init);
  const route = routes[`${request.method} ${new URL(request.url).pathname}`];
  return route ? route(request) : refuse(404, "not_found", "No such API endpoint.");
}

// Requests go nowhere: the fetch above answers them on the device.
export const api = createApiClient({ baseUrl: "https://demo.invalid", fetch: answer });

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

/** The demo's file in each release of the repository it asks for updates from. */
export const DEMO_APK = "clubedge-demo.apk";

/** The versions of an API that sets none: the demo then asks for no update. */
const noVersions = {
  minimumVersion: null,
  latestVersion: null,
  updateUrl: null,
  nextMinimumVersion: null,
  nextMinimumFrom: null,
};

interface Release {
  tag_name?: unknown;
  assets?: { name?: unknown; browser_download_url?: unknown }[];
}

/**
 * The versions the demo asks to be updated to. A build for a repository's releases
 * (VITE_DEMO_RELEASES, which the build script sets from DEMO_RELEASES) takes the latest one, once
 * it carries the demo's APK, as both the minimum and the latest, with the APK as the update: an
 * older demo then shows Update required, as an app below an API's minimum does. When GitHub can't
 * be reached, or the release has no APK yet, the demo can't tell, and the app keeps what it showed.
 */
async function appVersions(): Promise<Response> {
  const repository = import.meta.env.VITE_DEMO_RELEASES;
  if (!repository) return json(200, noVersions);
  const unknown = () => refuse(503, "unavailable", "The demo's latest release can't be read now.");
  let release: Release;
  try {
    const response = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, {
      headers: { accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return unknown();
    release = (await response.json()) as Release;
  } catch {
    return unknown();
  }
  const tag = typeof release.tag_name === "string" ? release.tag_name : "";
  const version = /^v?(\d+\.\d+\.\d+)$/.exec(tag)?.[1];
  const apk = release.assets?.find((asset) => asset.name === DEMO_APK)?.browser_download_url;
  if (!version || typeof apk !== "string") return unknown();
  return json(200, {
    ...noVersions,
    minimumVersion: version,
    latestVersion: version,
    updateUrl: apk,
  });
}

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
  "GET /api/app-version": () => appVersions(),
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

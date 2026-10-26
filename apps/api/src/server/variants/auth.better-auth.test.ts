import { afterEach, describe, expect, it, vi } from "vitest";
import { createBetterAuthServer } from "@clubedge/auth-better-auth";
import { getCurrentUser, handleAuthRequest } from "./auth.better-auth";

// Better Auth runs in the frontend's server, which the API asks for each request's session, or,
// in a project without a website, in the API itself. The variant replaces src/server/auth.ts in
// projects that use Better Auth, so only the Starter repository tests it here
// (clubedge.template.json's exclude).

const inApi = vi.hoisted(() => ({
  handler: vi.fn(async () => Response.json({ ok: true })),
  getSession: vi.fn(),
}));
vi.mock("@clubedge/auth-better-auth", () => ({
  createBetterAuthServer: vi.fn(() => ({
    handler: inApi.handler,
    api: { getSession: inApi.getSession },
  })),
  drizzleDatabase: vi.fn(),
}));
vi.mock("@/server/db", () => ({ getDb: vi.fn() }));

const getSession = new URL("http://frontend.test/api/auth/get-session");
const session = { user: { id: "user-1", email: "ada@example.com", name: "Ada" } };
const ada = { id: "user-1", email: "ada@example.com", displayName: "Ada" };

function betterAuth() {
  const fetch = vi.fn(async () => Response.json(session));
  vi.stubEnv("BETTER_AUTH_URL", "http://frontend.test");
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

const sessionRequest = (headers: Record<string, string>) =>
  new Request("http://api.test/api/session", { headers });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("getCurrentUser with Better Auth", () => {
  it("asks for the session with the browser's cookie", async () => {
    const fetch = betterAuth();
    const cookie = "better-auth.session_token=token.signature";
    expect(await getCurrentUser(sessionRequest({ cookie }))).toEqual(ada);
    expect(fetch).toHaveBeenCalledWith(expect.objectContaining({ href: getSession.href }), {
      headers: { cookie },
      signal: expect.any(AbortSignal),
    });
  });

  it("asks for the session with the bearer token of a client without the cookie", async () => {
    const fetch = betterAuth();
    const authorization = "Bearer token.signature";
    expect(await getCurrentUser(sessionRequest({ authorization }))).toEqual(ada);
    expect(fetch).toHaveBeenCalledWith(expect.objectContaining({ href: getSession.href }), {
      headers: { authorization },
      signal: expect.any(AbortSignal),
    });
  });

  it("asks nothing of a request with neither", async () => {
    const fetch = betterAuth();
    expect(await getCurrentUser(sessionRequest({}))).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("finds nobody when Better Auth has no session for it", async () => {
    betterAuth().mockResolvedValueOnce(Response.json(null));
    expect(await getCurrentUser(sessionRequest({ authorization: "Bearer revoked" }))).toBeNull();
  });
});

describe("Better Auth in the API, without a website", () => {
  it("runs once BETTER_AUTH_SECRET is set, and reads each session in the API", async () => {
    const fetch = betterAuth();
    vi.stubEnv("BETTER_AUTH_SECRET", "s".repeat(32));
    inApi.getSession.mockResolvedValueOnce(session).mockResolvedValueOnce(null);
    const request = sessionRequest({ cookie: "better-auth.session_token=token.signature" });

    expect(await getCurrentUser(request)).toEqual(ada);
    expect(await getCurrentUser(request)).toBeNull();
    expect(inApi.getSession).toHaveBeenCalledWith({ headers: request.headers });
    expect(fetch).not.toHaveBeenCalled();
    // Emailed links go through Better Auth's endpoints, then open the app, which it trusts.
    expect(createBetterAuthServer).toHaveBeenCalledWith(
      expect.objectContaining({
        emailLinks: "endpoints",
        trustedOrigins: [expect.stringMatching(/^[a-z][a-z0-9+.-]*:\/\/$/)],
        deleteUser: false,
      }),
    );
  });

  it("serves Better Auth's endpoints, and answers 503 until the secret is set", async () => {
    const request = new Request("http://api.test/api/auth/ok");
    expect((await handleAuthRequest(request)).status).toBe(503);
    vi.stubEnv("BETTER_AUTH_SECRET", "s".repeat(32));
    expect(await (await handleAuthRequest(request)).json()).toEqual({ ok: true });
    expect(inApi.handler).toHaveBeenCalledWith(request);
  });
});

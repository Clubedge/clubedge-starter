import { err, ok } from "@clubedge/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  exchangeCodeForSession: vi.fn(),
}));
const state = vi.hoisted(() => ({ configured: true }));
const limit = vi.hoisted(() => vi.fn());
const ensureUserProfile = vi.hoisted(() => vi.fn());

vi.mock("./auth", () => ({
  getAuth: () => auth,
  isAuthConfigured: () => state.configured,
}));
vi.mock("./cache", () => ({ createRateLimiter: () => ({ limit }) }));
vi.mock("./users", () => ({ ensureUserProfile }));
vi.mock("@/env/server", () => ({ getAppUrl: () => "https://app.example" }));

const { handleAuthCallback, handleFormEndpointVisit, handleSignIn, handleSignOut, handleSignUp } =
  await import("./auth-forms");

const user = { id: "user-1", email: "ada@example.com" };

function formPost(path: string, fields: Record<string, string>) {
  return new Request(`https://app.example${path}`, {
    method: "POST",
    body: new URLSearchParams(fields),
    headers: { "x-forwarded-for": "203.0.113.9" },
  });
}

const credentials = { email: "ada@example.com", password: "correct horse" };

function expectRedirect(response: Response, location: string) {
  expect(response.status).toBe(303);
  expect(response.headers.get("Location")).toBe(location);
}

beforeEach(() => {
  vi.clearAllMocks();
  state.configured = true;
  limit.mockResolvedValue({ success: true });
});

describe("handleSignIn", () => {
  it("signs in, syncs the profile, and returns to the requested page", async () => {
    auth.signInWithPassword.mockResolvedValue(ok(user));
    const response = await handleSignIn(
      formPost("/auth/sign-in", { ...credentials, next: "/projects?tab=a" }),
    );
    expectRedirect(response, "/projects?tab=a");
    expect(auth.signInWithPassword).toHaveBeenCalledWith(credentials);
    expect(ensureUserProfile).toHaveBeenCalledWith(user);
    expect(limit).toHaveBeenCalledWith("auth:sign-in:203.0.113.9");
  });

  it("never redirects off-site", async () => {
    auth.signInWithPassword.mockResolvedValue(ok(user));
    const response = await handleSignIn(
      formPost("/auth/sign-in", { ...credentials, next: "https://evil.example" }),
    );
    expectRedirect(response, "/dashboard");
  });

  it("reports invalid input and invalid credentials", async () => {
    expectRedirect(
      await handleSignIn(formPost("/auth/sign-in", { email: "nope", password: "short" })),
      "/login?error=invalid-input",
    );
    auth.signInWithPassword.mockResolvedValue(err("invalid-credentials"));
    expectRedirect(
      await handleSignIn(formPost("/auth/sign-in", credentials)),
      "/login?error=invalid-credentials",
    );
    expect(ensureUserProfile).not.toHaveBeenCalled();
  });

  it("stops at the rate limit before contacting the provider", async () => {
    limit.mockResolvedValue({ success: false });
    const response = await handleSignIn(formPost("/auth/sign-in", { ...credentials, next: "/x" }));
    expectRedirect(response, "/login?error=rate-limited&next=%2Fx");
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("fails open when the rate limiter is unavailable", async () => {
    limit.mockRejectedValue(new Error("redis down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    auth.signInWithPassword.mockResolvedValue(ok(user));
    expectRedirect(await handleSignIn(formPost("/auth/sign-in", credentials)), "/dashboard");
  });

  it("returns to the login page while authentication is not configured", async () => {
    state.configured = false;
    const response = await handleSignIn(formPost("/auth/sign-in", { ...credentials, next: "/x" }));
    expectRedirect(response, "/login?next=%2Fx");
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });
});

describe("handleSignUp", () => {
  it("sends a confirmation link that returns through the callback", async () => {
    auth.signUp.mockResolvedValue(ok({ user, needsConfirmation: true }));
    const response = await handleSignUp(
      formPost("/auth/sign-up", { ...credentials, next: "/projects" }),
    );
    expectRedirect(response, "/login?mode=signup&check-email=1&next=%2Fprojects");
    expect(auth.signUp).toHaveBeenCalledWith({
      ...credentials,
      emailRedirectTo: "https://app.example/auth/callback?next=%2Fprojects",
    });
    expect(ensureUserProfile).not.toHaveBeenCalled();
  });

  it("signs the user in straight away when no confirmation is required", async () => {
    auth.signUp.mockResolvedValue(ok({ user, needsConfirmation: false }));
    expectRedirect(await handleSignUp(formPost("/auth/sign-up", credentials)), "/dashboard");
    expect(ensureUserProfile).toHaveBeenCalledWith(user);
  });

  it("reports provider failures", async () => {
    auth.signUp.mockResolvedValue(err("signup-failed"));
    expectRedirect(
      await handleSignUp(formPost("/auth/sign-up", credentials)),
      "/login?mode=signup&error=signup-failed",
    );
  });
});

describe("handleAuthCallback", () => {
  it("exchanges the code and continues to the requested page", async () => {
    auth.exchangeCodeForSession.mockResolvedValue(ok(user));
    const response = await handleAuthCallback(
      new Request("https://app.example/auth/callback?code=abc&next=%2Fprojects"),
    );
    expectRedirect(response, "/projects");
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(ensureUserProfile).toHaveBeenCalledWith(user);
  });

  it("reports missing and invalid codes", async () => {
    expectRedirect(
      await handleAuthCallback(new Request("https://app.example/auth/callback")),
      "/login?error=auth-callback",
    );
    auth.exchangeCodeForSession.mockResolvedValue(err("invalid-code"));
    expectRedirect(
      await handleAuthCallback(new Request("https://app.example/auth/callback?code=bad")),
      "/login?error=auth-callback",
    );
  });
});

describe("handleSignOut and direct visits", () => {
  it("signs out and returns to the login page, even when the provider fails", async () => {
    expectRedirect(await handleSignOut(), "/login");
    expect(auth.signOut).toHaveBeenCalled();

    auth.signOut.mockRejectedValue(new Error("network"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expectRedirect(await handleSignOut(), "/login");
  });

  it("sends direct visits to the login page", () => {
    expectRedirect(handleFormEndpointVisit(), "/login");
  });
});

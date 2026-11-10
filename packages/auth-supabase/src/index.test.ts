import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CookieStore } from "@clubedge/auth";

const supabaseAuth = {
  getUser: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
};
let cookieMethods: { getAll(): unknown; setAll(values: unknown): void } | undefined;

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(
    (_url: string, _key: string, options: { cookies: typeof cookieMethods }) => {
      cookieMethods = options.cookies;
      return { auth: supabaseAuth };
    },
  ),
}));

const adminDeleteUser = vi.fn();
const getClaims = vi.fn();
const getBearerUser = vi.fn();
const createClient = vi.fn<(...args: unknown[]) => unknown>(() => ({
  auth: { admin: { deleteUser: adminDeleteUser }, getClaims, getUser: getBearerUser },
}));
vi.mock("@supabase/supabase-js", () => ({ createClient }));

const { createSupabaseAuth, createSupabaseBearerClient, getSupabaseBearerUser } =
  await import("./index");

const supabaseUser = { id: "user-1", email: "ada@example.com" };

function setup(secretKey?: string) {
  const cookies: CookieStore = {
    getAll: vi.fn(() => [{ name: "sb", value: "token" }]),
    setAll: vi.fn(),
  };
  const auth = createSupabaseAuth({
    url: "https://x.supabase.co",
    publishableKey: "pk",
    cookies,
    ...(secretKey ? { secretKey } : {}),
  });
  return { auth, cookies };
}

describe("createSupabaseAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("bridges the framework cookie store to Supabase", () => {
    const { cookies } = setup();
    expect(cookieMethods?.getAll()).toEqual([{ name: "sb", value: "token" }]);
    const values = [{ name: "sb", value: "next", options: { path: "/" } }];
    cookieMethods?.setAll(values);
    expect(cookies.setAll).toHaveBeenCalledWith(values);
  });

  it("returns the verified user, or null when Supabase rejects the session", async () => {
    const { auth } = setup();
    supabaseAuth.getUser.mockResolvedValueOnce({ data: { user: supabaseUser }, error: null });
    expect(await auth.getUser()).toEqual({ id: "user-1", email: "ada@example.com" });

    supabaseAuth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: new Error("expired"),
    });
    expect(await auth.getUser()).toBeNull();
  });

  it("maps sign-in results without leaking provider errors", async () => {
    const { auth } = setup();
    const credentials = { email: "ada@example.com", password: "correct horse" };

    supabaseAuth.signInWithPassword.mockResolvedValueOnce({
      data: { user: supabaseUser },
      error: null,
    });
    expect(await auth.signInWithPassword(credentials)).toEqual({
      ok: true,
      value: { id: "user-1", email: "ada@example.com" },
    });

    supabaseAuth.signInWithPassword.mockResolvedValueOnce({
      data: { user: null },
      error: new Error("Invalid login credentials"),
    });
    expect(await auth.signInWithPassword(credentials)).toEqual({
      ok: false,
      error: "invalid-credentials",
    });
  });

  it("reports when sign-up needs email confirmation", async () => {
    const { auth } = setup();
    supabaseAuth.signUp.mockResolvedValueOnce({
      data: { user: supabaseUser, session: null },
      error: null,
    });

    const result = await auth.signUp({
      email: "ada@example.com",
      password: "correct horse",
      emailRedirectTo: "https://app.example/auth/callback",
    });

    expect(supabaseAuth.signUp).toHaveBeenCalledWith({
      email: "ada@example.com",
      password: "correct horse",
      options: { emailRedirectTo: "https://app.example/auth/callback" },
    });
    expect(result).toEqual({
      ok: true,
      value: { user: { id: "user-1", email: "ada@example.com" }, needsConfirmation: true },
    });
  });

  it("maps sign-up and code exchange failures", async () => {
    const { auth } = setup();
    supabaseAuth.signUp.mockResolvedValueOnce({ data: {}, error: new Error("taken") });
    expect(
      await auth.signUp({ email: "a@b.co", password: "12345678", emailRedirectTo: "https://a.b" }),
    ).toEqual({ ok: false, error: "signup-failed" });

    supabaseAuth.exchangeCodeForSession.mockResolvedValueOnce({
      data: { user: null },
      error: new Error("bad code"),
    });
    expect(await auth.exchangeCodeForSession("code")).toEqual({ ok: false, error: "invalid-code" });
  });

  it("throws when sign-out fails", async () => {
    const { auth } = setup();
    supabaseAuth.signOut.mockResolvedValueOnce({ error: new Error("network") });
    await expect(auth.signOut()).rejects.toThrow("network");
  });

  it("sends reset emails through the auth callback without revealing failures", async () => {
    const { auth } = setup();
    expect(auth.canResetPassword).toBe(true);
    supabaseAuth.resetPasswordForEmail.mockResolvedValueOnce({ data: {}, error: null });
    await auth.requestPasswordReset({
      email: "ada@example.com",
      redirectTo: "http://localhost:3000/auth/callback?next=/reset-password",
    });
    expect(supabaseAuth.resetPasswordForEmail).toHaveBeenCalledWith("ada@example.com", {
      redirectTo: "http://localhost:3000/auth/callback?next=/reset-password",
    });

    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    supabaseAuth.resetPasswordForEmail.mockResolvedValueOnce({
      data: null,
      error: { message: "rate limited" },
    });
    await expect(
      auth.requestPasswordReset({ email: "ada@example.com", redirectTo: "x" }),
    ).resolves.toBeUndefined();
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it("sets the new password with the session the reset link created", async () => {
    const { auth } = setup();
    supabaseAuth.updateUser.mockResolvedValueOnce({ data: { user: supabaseUser }, error: null });
    expect(await auth.resetPassword({ password: "a brand new password" })).toEqual({
      ok: true,
      value: undefined,
    });
    expect(supabaseAuth.updateUser).toHaveBeenCalledWith({ password: "a brand new password" });

    supabaseAuth.updateUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: "Auth session missing" },
    });
    expect(await auth.resetPassword({ password: "a brand new password" })).toEqual({
      ok: false,
      error: "invalid-reset",
    });
  });

  it("changes the password only after the current one signs in", async () => {
    const { auth } = setup();
    supabaseAuth.getUser.mockResolvedValue({ data: { user: supabaseUser }, error: null });
    supabaseAuth.signInWithPassword.mockResolvedValueOnce({ data: {}, error: new Error("bad") });
    await expect(
      auth.changePassword({ currentPassword: "wrong", newPassword: "new secret 123" }),
    ).resolves.toEqual({
      ok: false,
      error: "invalid-password",
    });
    expect(supabaseAuth.updateUser).not.toHaveBeenCalled();

    supabaseAuth.signInWithPassword.mockResolvedValueOnce({
      data: { user: supabaseUser },
      error: null,
    });
    supabaseAuth.updateUser.mockResolvedValueOnce({ error: null });
    supabaseAuth.signOut.mockResolvedValueOnce({ error: null });
    await expect(
      auth.changePassword({ currentPassword: "right", newPassword: "new secret 123" }),
    ).resolves.toEqual({
      ok: true,
      value: undefined,
    });
    expect(supabaseAuth.signInWithPassword).toHaveBeenLastCalledWith({
      email: "ada@example.com",
      password: "right",
    });
    expect(supabaseAuth.updateUser).toHaveBeenCalledWith({ password: "new secret 123" });
    expect(supabaseAuth.signOut).toHaveBeenCalledWith({ scope: "others" });
  });

  it("deletes accounts only with the secret key and the right password", async () => {
    const withoutKey = setup().auth;
    expect(withoutKey.canDeleteAccount).toBe(false);
    await expect(withoutKey.deleteAccount({ password: "right" })).resolves.toEqual({
      ok: false,
      error: "not-supported",
    });

    const { auth } = setup("sb_secret_x");
    expect(auth.canDeleteAccount).toBe(true);
    supabaseAuth.getUser.mockResolvedValue({ data: { user: supabaseUser }, error: null });
    supabaseAuth.signInWithPassword.mockResolvedValueOnce({
      data: { user: supabaseUser },
      error: null,
    });
    // When removing the app's data fails, the user is kept.
    await expect(
      auth.deleteAccount({
        password: "right",
        beforeDelete: () => Promise.reject(new Error("database down")),
      }),
    ).rejects.toThrow("database down");
    expect(adminDeleteUser).not.toHaveBeenCalled();

    supabaseAuth.signInWithPassword.mockResolvedValueOnce({
      data: { user: supabaseUser },
      error: null,
    });
    adminDeleteUser.mockResolvedValueOnce({ error: null });
    supabaseAuth.signOut.mockResolvedValueOnce({ error: null });
    const beforeDelete = vi.fn(async () => {
      expect(adminDeleteUser).not.toHaveBeenCalled();
    });
    await expect(auth.deleteAccount({ password: "right", beforeDelete })).resolves.toEqual({
      ok: true,
      value: undefined,
    });
    expect(beforeDelete).toHaveBeenCalledOnce();
    expect(adminDeleteUser).toHaveBeenCalledWith("user-1");
    expect(supabaseAuth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});

describe("createSupabaseBearerClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends the bearer token, so row-level security sees its user", () => {
    createSupabaseBearerClient("https://x.supabase.co", "pk", "token-1");
    expect(createClient).toHaveBeenCalledWith("https://x.supabase.co", "pk", {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: "Bearer token-1" } },
    });
  });

  it("acts as anonymous without a token", () => {
    createSupabaseBearerClient("https://x.supabase.co", "pk");
    expect(createClient).toHaveBeenCalledWith("https://x.supabase.co", "pk", {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  });
});

describe("getSupabaseBearerUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("verifies tokens with one client for the project, which keeps its keys, and maps the claims", async () => {
    getClaims.mockResolvedValueOnce({
      data: {
        claims: {
          role: "authenticated",
          sub: "user-1",
          email: "ada@example.com",
          user_metadata: { full_name: "Ada Lovelace" },
        },
      },
      error: null,
    });
    expect(await getSupabaseBearerUser("https://a.supabase.co", "pk", "token-1")).toEqual({
      id: "user-1",
      email: "ada@example.com",
      displayName: "Ada Lovelace",
    });
    expect(getClaims).toHaveBeenLastCalledWith("token-1");

    getClaims.mockResolvedValueOnce({
      data: { claims: { role: "authenticated", sub: "user-2", email: "grace@example.com" } },
      error: null,
    });
    expect(await getSupabaseBearerUser("https://a.supabase.co", "pk", "token-2")).toEqual({
      id: "user-2",
      email: "grace@example.com",
      displayName: null,
    });
    // One client for both tokens, and no request to Supabase Auth for either.
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(getBearerUser).not.toHaveBeenCalled();
  });

  it("asks Supabase Auth what it cannot settle here, as before", async () => {
    getClaims.mockResolvedValueOnce({ data: null, error: new Error("JWKS out of reach") });
    getBearerUser.mockResolvedValueOnce({
      data: {
        user: { id: "user-5", email: "grace@example.com", user_metadata: { name: "Grace" } },
      },
      error: null,
    });
    expect(await getSupabaseBearerUser("https://c.supabase.co", "pk", "token-5")).toEqual({
      id: "user-5",
      email: "grace@example.com",
      displayName: "Grace",
    });
    expect(getBearerUser).toHaveBeenLastCalledWith("token-5");

    // A check that throws, rather than answering with an error, is asked of Supabase Auth too.
    getClaims.mockRejectedValueOnce(new Error("network"));
    getBearerUser.mockResolvedValueOnce({ data: { user: null }, error: new Error("invalid JWT") });
    expect(await getSupabaseBearerUser("https://c.supabase.co", "pk", "token-6")).toBeNull();
  });

  it("refuses what is not a signed-in user's token", async () => {
    getBearerUser.mockResolvedValue({ data: { user: null }, error: new Error("invalid JWT") });
    for (const answer of [
      { data: null, error: new Error("Invalid JWT signature") },
      { data: { claims: { role: "anon" } }, error: null },
      { data: { claims: { role: "service_role", sub: "x", email: "x@example.com" } }, error: null },
      {
        data: { claims: { role: "authenticated", sub: "user-3", is_anonymous: true } },
        error: null,
      },
      { data: { claims: { role: "authenticated", sub: "user-4", email: "" } }, error: null },
    ]) {
      getClaims.mockResolvedValueOnce(answer);
      expect(await getSupabaseBearerUser("https://b.supabase.co", "pk", "token")).toBeNull();
    }
  });
});

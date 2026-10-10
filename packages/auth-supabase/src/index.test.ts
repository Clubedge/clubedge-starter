import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CookieStore } from "@clubedge/auth";

const supabaseAuth = {
  getUser: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  exchangeCodeForSession: vi.fn(),
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

const { createSupabaseAuth } = await import("./index");

const supabaseUser = { id: "user-1", email: "ada@example.com" };

function setup() {
  const cookies: CookieStore = {
    getAll: vi.fn(() => [{ name: "sb", value: "token" }]),
    setAll: vi.fn(),
  };
  const auth = createSupabaseAuth({ url: "https://x.supabase.co", publishableKey: "pk", cookies });
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
});

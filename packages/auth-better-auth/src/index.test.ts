import { randomBytes } from "node:crypto";
import { memoryAdapter } from "better-auth/adapters/memory";
import { beforeEach, describe, expect, it } from "vitest";
import type { CookieStore, CookieToSet } from "@clubedge/auth";
import {
  createBetterAuth,
  createBetterAuthServer,
  type AuthEmail,
  type BetterAuthServer,
} from "./index";

// Real Better Auth on its in-memory database: these tests exercise the cookie bridge and the
// AuthProvider contract end to end, without PostgreSQL.

/** A browser's cookie jar, as the framework would expose it through CookieStore. */
function cookieJar() {
  const values = new Map<string, string>();
  const writes: CookieToSet[] = [];
  const store: CookieStore = {
    getAll: () => [...values].map(([name, value]) => ({ name, value })),
    setAll(cookies) {
      for (const cookie of cookies) {
        writes.push(cookie);
        if (cookie.options?.maxAge === 0) values.delete(cookie.name);
        else values.set(cookie.name, cookie.value);
      }
    },
  };
  return { store, writes, values };
}

const credentials = { email: "ada@example.com", password: "correct horse battery" };
let server: BetterAuthServer;

beforeEach(() => {
  server = createBetterAuthServer({
    database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
    secret: randomBytes(32).toString("hex"),
    baseUrl: "http://localhost:3000",
  });
});

describe("Better Auth adapter", () => {
  it("signs a new user up and in with an HTTP-only session cookie", async () => {
    const jar = cookieJar();
    const auth = createBetterAuth({ server, cookies: jar.store });

    const result = await auth.signUp({ ...credentials, emailRedirectTo: "unused" });

    expect(result).toMatchObject({ ok: true, value: { needsConfirmation: false } });
    const user = result.ok ? result.value.user : null;
    expect(user?.email).toBe("ada@example.com");
    expect(user?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(jar.writes[0]?.options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    expect(await auth.getUser()).toEqual(user);
  });

  it("signs an existing user in on a new device", async () => {
    await createBetterAuth({ server, cookies: cookieJar().store }).signUp({
      ...credentials,
      emailRedirectTo: "unused",
    });
    const jar = cookieJar();
    const auth = createBetterAuth({ server, cookies: jar.store });

    expect(await auth.getUser()).toBeNull();
    const result = await auth.signInWithPassword(credentials);

    expect(result).toMatchObject({ ok: true, value: { email: "ada@example.com" } });
    expect(await auth.getUser()).toMatchObject({ email: "ada@example.com" });
  });

  it("reports a wrong password without setting cookies", async () => {
    await createBetterAuth({ server, cookies: cookieJar().store }).signUp({
      ...credentials,
      emailRedirectTo: "unused",
    });
    const jar = cookieJar();
    const result = await createBetterAuth({ server, cookies: jar.store }).signInWithPassword({
      email: credentials.email,
      password: "wrong password",
    });

    expect(result).toEqual({ ok: false, error: "invalid-credentials" });
    expect(jar.writes).toEqual([]);
  });

  it("refuses a second account for the same email", async () => {
    const auth = createBetterAuth({ server, cookies: cookieJar().store });
    await auth.signUp({ ...credentials, emailRedirectTo: "unused" });

    const again = await createBetterAuth({ server, cookies: cookieJar().store }).signUp({
      ...credentials,
      emailRedirectTo: "unused",
    });
    expect(again).toEqual({ ok: false, error: "signup-failed" });
  });

  it("signs out by expiring the session cookie", async () => {
    const jar = cookieJar();
    const auth = createBetterAuth({ server, cookies: jar.store });
    await auth.signUp({ ...credentials, emailRedirectTo: "unused" });

    await auth.signOut();

    expect(jar.values.size).toBe(0);
    expect(await auth.getUser()).toBeNull();
  });

  it("refreshes quietly when there is no session", async () => {
    const jar = cookieJar();
    await createBetterAuth({ server, cookies: jar.store }).refreshSession();
    expect(jar.writes).toEqual([]);
  });

  it("rejects codes that are not email verification tokens", async () => {
    const auth = createBetterAuth({ server, cookies: cookieJar().store });
    expect(await auth.exchangeCodeForSession("anything")).toEqual({
      ok: false,
      error: "invalid-code",
    });
  });
});

describe("Better Auth account settings", () => {
  async function signedUp() {
    const jar = cookieJar();
    const auth = createBetterAuth({ server, cookies: jar.store });
    await auth.signUp({ ...credentials, emailRedirectTo: "unused" });
    return { jar, auth };
  }

  it("changes the password after checking the current one, and signs out other devices", async () => {
    const { auth } = await signedUp();
    const other = createBetterAuth({ server, cookies: cookieJar().store });
    await other.signInWithPassword(credentials);
    expect(await other.getUser()).not.toBeNull();

    await expect(
      auth.changePassword({
        currentPassword: "not my password",
        newPassword: "a brand new secret",
      }),
    ).resolves.toEqual({ ok: false, error: "invalid-password" });
    await expect(
      auth.changePassword({
        currentPassword: credentials.password,
        newPassword: "a brand new secret",
      }),
    ).resolves.toEqual({ ok: true, value: undefined });

    // This device stays signed in; the other one is signed out.
    expect(await auth.getUser()).toMatchObject({ email: credentials.email });
    expect(await other.getUser()).toBeNull();
    const fresh = createBetterAuth({ server, cookies: cookieJar().store });
    expect((await fresh.signInWithPassword(credentials)).ok).toBe(false);
    expect(
      (await fresh.signInWithPassword({ ...credentials, password: "a brand new secret" })).ok,
    ).toBe(true);
  });

  it("deletes the account only with the right password, and ends the session", async () => {
    const { auth } = await signedUp();
    expect(auth.canDeleteAccount).toBe(true);

    await expect(auth.deleteAccount({ password: "not my password" })).resolves.toEqual({
      ok: false,
      error: "invalid-password",
    });
    expect(await auth.getUser()).not.toBeNull();

    await expect(auth.deleteAccount({ password: credentials.password })).resolves.toEqual({
      ok: true,
      value: undefined,
    });
    expect(await auth.getUser()).toBeNull();
    const fresh = createBetterAuth({ server, cookies: cookieJar().store });
    expect((await fresh.signInWithPassword(credentials)).ok).toBe(false);
  });

  it("refuses both without a session", async () => {
    const auth = createBetterAuth({ server, cookies: cookieJar().store });
    await expect(
      auth.changePassword({ currentPassword: "a", newPassword: "b".repeat(8) }),
    ).resolves.toEqual({ ok: false, error: "not-signed-in" });
    await expect(auth.deleteAccount({ password: "a" })).resolves.toEqual({
      ok: false,
      error: "not-signed-in",
    });
  });
});

describe("Better Auth emails", () => {
  /** A server that keeps the emails it sends, and the first link in the latest one. */
  function serverWithEmail({ requireEmailVerification = false } = {}) {
    const sent: AuthEmail[] = [];
    const emailServer = createBetterAuthServer({
      database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
      secret: randomBytes(32).toString("hex"),
      baseUrl: "http://localhost:3000",
      sendEmail: async (email) => {
        sent.push(email);
      },
      requireEmailVerification,
      appName: "Clubedge",
    });
    // Emails are sent in the background; wait until the expected number has arrived.
    async function emails(count: number) {
      for (let attempt = 0; attempt < 50 && sent.length < count; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(sent).toHaveLength(count);
      return sent;
    }
    const linkIn = (email: AuthEmail) => new URL(/https?:\/\/\S+/.exec(email.text)![0]);
    return { emailServer, emails, linkIn };
  }

  it("resets a password through the emailed link, once", async () => {
    const { emailServer, emails, linkIn } = serverWithEmail();
    await createBetterAuth({ server: emailServer, cookies: cookieJar().store }).signUp({
      ...credentials,
      emailRedirectTo: "http://localhost:3000/auth/callback",
    });
    const auth = createBetterAuth({ server: emailServer, cookies: cookieJar().store });
    expect(auth.canResetPassword).toBe(true);

    await auth.requestPasswordReset({ email: credentials.email, redirectTo: "ignored" });
    const [, reset] = await emails(2); // The first email is the sign-up verification.
    expect(reset!.subject).toBe("Reset your Clubedge password");
    const link = linkIn(reset!);
    expect(`${link.origin}${link.pathname}`).toBe("http://localhost:3000/reset-password");
    const token = link.searchParams.get("token")!;

    expect(await auth.resetPassword({ password: "a brand new password", token })).toEqual({
      ok: true,
      value: undefined,
    });
    expect(
      (await auth.signInWithPassword({ ...credentials, password: "a brand new password" })).ok,
    ).toBe(true);
    expect(await auth.signInWithPassword(credentials)).toEqual({
      ok: false,
      error: "invalid-credentials",
    });
    expect(await auth.resetPassword({ password: "yet another password", token })).toEqual({
      ok: false,
      error: "invalid-reset",
    });
  });

  it("answers reset requests for unknown addresses the same way, without sending", async () => {
    const { emailServer, emails } = serverWithEmail();
    const auth = createBetterAuth({ server: emailServer, cookies: cookieJar().store });
    await expect(
      auth.requestPasswordReset({ email: "nobody@example.com", redirectTo: "x" }),
    ).resolves.toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await emails(0);
  });

  it("offers no password reset without an email sender", async () => {
    const auth = createBetterAuth({ server, cookies: cookieJar().store });
    expect(auth.canResetPassword).toBe(false);
    await expect(
      auth.requestPasswordReset({ email: credentials.email, redirectTo: "x" }),
    ).resolves.toBeUndefined();
    expect(
      await auth.resetPassword({ password: "a brand new password", token: "anything" }),
    ).toEqual({
      ok: false,
      error: "invalid-reset",
    });
  });

  it("requires a confirmed email when configured, and signs in from the emailed link", async () => {
    const { emailServer, emails, linkIn } = serverWithEmail({ requireEmailVerification: true });
    const jar = cookieJar();
    const auth = createBetterAuth({ server: emailServer, cookies: jar.store });

    const signUp = await auth.signUp({
      ...credentials,
      emailRedirectTo: "http://localhost:3000/auth/callback",
    });
    expect(signUp).toMatchObject({ ok: true, value: { needsConfirmation: true } });
    expect(await auth.getUser()).toBeNull();
    expect(await auth.signInWithPassword(credentials)).toEqual({
      ok: false,
      error: "email-not-verified",
    });

    const [verification] = await emails(1);
    expect(verification!.subject).toBe("Confirm your email for Clubedge");
    const link = linkIn(verification!);
    expect(`${link.origin}${link.pathname}`).toBe("http://localhost:3000/auth/callback");

    const exchanged = await auth.exchangeCodeForSession(link.searchParams.get("code")!);
    expect(exchanged).toMatchObject({ ok: true, value: { email: credentials.email } });
    expect(await auth.getUser()).toMatchObject({ email: credentials.email });
    expect(await auth.exchangeCodeForSession("not-a-token")).toEqual({
      ok: false,
      error: "invalid-code",
    });
  });

  it("still signs up directly and sends a confirmation email when verification is optional", async () => {
    const { emailServer, emails } = serverWithEmail();
    const auth = createBetterAuth({ server: emailServer, cookies: cookieJar().store });
    const signUp = await auth.signUp({
      ...credentials,
      emailRedirectTo: "http://localhost:3000/auth/callback",
    });
    expect(signUp).toMatchObject({ ok: true, value: { needsConfirmation: false } });
    expect(await auth.getUser()).toMatchObject({ email: credentials.email });
    await emails(1);
  });
});

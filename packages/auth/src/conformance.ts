// The behaviour every AuthProvider must have, as one test suite. A provider's tests call
// describeAuthProvider with a harness, so a new provider is proven by passing it rather than by
// review, and providers can't drift apart on sign-in, sessions, resets, or account settings:
//
//   describeAuthProvider("better-auth", () => ({ browser: () => createBetterAuth(...), ... }));
//
// It runs in Vitest, which is why it is a separate entry (`@clubedge/auth/conformance`) that only
// tests import. Each test uses its own email address, so a provider may keep users between tests.
import { describe, expect, it, vi } from "vitest";
import type { AuthProvider } from "./types";

export interface AuthHarness {
  /** A new browser: a provider bound to a cookie jar of its own, empty at first. */
  browser(): AuthProvider | Promise<AuthProvider>;
  /**
   * Opens the latest password reset email sent to `email` in `browser`, as a person clicking its
   * link would. Resolves to the token resetPassword takes, or to undefined when the link signs
   * the browser in instead (Supabase's goes through the auth callback).
   */
  openResetLink(email: string, browser: AuthProvider): Promise<string | undefined>;
}

export interface AuthConformanceOptions {
  /** Skip the whole suite, for example when the provider's server or emulator isn't running. */
  skip?: boolean | string;
  /** Per-test timeout in milliseconds, for providers behind a network round trip. Default 30s. */
  timeoutMs?: number;
}

let counter = 0;
/** A new address per test, in a domain no mail is delivered to. */
const newEmail = () => `user-${Date.now().toString(36)}-${counter++}@example.com`;
const password = "correct horse battery staple";
const redirect = { emailRedirectTo: "http://localhost:3000/auth/callback" };

export function describeAuthProvider(
  provider: string,
  setup: () => AuthHarness | Promise<AuthHarness>,
  options: AuthConformanceOptions = {},
) {
  const timeout = options.timeoutMs ?? 30_000;
  const suite = options.skip ? describe.skip : describe;

  /** A new account, signed in on the browser it signed up on. */
  async function account(harness: AuthHarness) {
    const email = newEmail();
    const browser = await harness.browser();
    const result = await browser.signUp({ email, password, ...redirect });
    expect(result.ok, "sign-up succeeds").toBe(true);
    if (!result.ok) throw new Error("sign-up failed");
    expect(result.value.needsConfirmation, "the harness signs up without email confirmation").toBe(
      false,
    );
    const user = await browser.getUser();
    expect(user).toMatchObject({ email });
    return { email, browser, user: user! };
  }

  suite(`AuthProvider conformance: ${provider}`, () => {
    it(
      "signs up, then signs in on another browser as the same user",
      async () => {
        const harness = await setup();
        const { email, user } = await account(harness);
        expect(user.id).toBeTruthy();

        const other = await harness.browser();
        expect(await other.getUser()).toBeNull();
        const signedIn = await other.signInWithPassword({ email, password });
        expect(signedIn).toMatchObject({ ok: true, value: { id: user.id, email } });
        expect(await other.getUser()).toMatchObject({ id: user.id, email });
      },
      timeout,
    );

    it(
      "refuses a wrong password and an unknown address the same way",
      async () => {
        const harness = await setup();
        const { email } = await account(harness);
        const other = await harness.browser();
        expect(
          await other.signInWithPassword({ email, password: "not the password at all" }),
        ).toEqual({
          ok: false,
          error: "invalid-credentials",
        });
        expect(await other.signInWithPassword({ email: newEmail(), password })).toEqual({
          ok: false,
          error: "invalid-credentials",
        });
        expect(await other.getUser()).toBeNull();
      },
      timeout,
    );

    it(
      "keeps an existing account when its address signs up again",
      async () => {
        const harness = await setup();
        const { email, user } = await account(harness);
        // Providers may refuse, or answer as if it worked to hide which addresses have accounts.
        await (
          await harness.browser()
        ).signUp({ email, password: "a different password", ...redirect });
        const other = await harness.browser();
        expect(await other.signInWithPassword({ email, password: "a different password" })).toEqual(
          {
            ok: false,
            error: "invalid-credentials",
          },
        );
        expect(await other.signInWithPassword({ email, password })).toMatchObject({
          ok: true,
          value: { id: user.id },
        });
      },
      timeout,
    );

    it(
      "signs out, and refreshes quietly without a session",
      async () => {
        const harness = await setup();
        const { browser } = await account(harness);
        await browser.signOut();
        expect(await browser.getUser()).toBeNull();
        const empty = await harness.browser();
        await expect(empty.refreshSession()).resolves.toBeUndefined();
        expect(await empty.getUser()).toBeNull();
      },
      timeout,
    );

    it(
      "resets a password through the emailed link",
      async () => {
        const harness = await setup();
        const { email, user } = await account(harness);
        const browser = await harness.browser();
        if (!browser.canResetPassword) return;
        // An unknown address gets the same answer, so a reset form can't reveal who has an account.
        await expect(
          browser.requestPasswordReset({ email: newEmail(), redirectTo: redirect.emailRedirectTo }),
        ).resolves.toBeUndefined();

        await browser.requestPasswordReset({
          email,
          redirectTo: `${redirect.emailRedirectTo}?next=/reset-password`,
        });
        const token = await harness.openResetLink(email, browser);
        const newPassword = "a brand new password";
        expect(
          await browser.resetPassword({ password: newPassword, ...(token ? { token } : {}) }),
        ).toEqual({ ok: true, value: undefined });

        const other = await harness.browser();
        expect(await other.signInWithPassword({ email, password })).toEqual({
          ok: false,
          error: "invalid-credentials",
        });
        expect(await other.signInWithPassword({ email, password: newPassword })).toMatchObject({
          ok: true,
          value: { id: user.id },
        });
        // A link works once.
        if (token) {
          expect(
            await (
              await harness.browser()
            ).resetPassword({ password: "yet another password", token }),
          ).toEqual({
            ok: false,
            error: "invalid-reset",
          });
        }
      },
      timeout,
    );

    it(
      "refuses a reset without a valid link",
      async () => {
        const harness = await setup();
        const browser = await harness.browser();
        expect(
          await browser.resetPassword({ password: "a brand new password", token: "not-a-token" }),
        ).toEqual({
          ok: false,
          error: "invalid-reset",
        });
      },
      timeout,
    );

    it(
      "changes the password after checking the current one, and signs out other sessions",
      async () => {
        const harness = await setup();
        const { email, browser, user } = await account(harness);
        const elsewhere = await harness.browser();
        expect((await elsewhere.signInWithPassword({ email, password })).ok).toBe(true);

        expect(
          await browser.changePassword({
            currentPassword: "not the password at all",
            newPassword: "a brand new password",
          }),
        ).toEqual({
          ok: false,
          error: "invalid-password",
        });
        expect(
          await browser.changePassword({
            currentPassword: password,
            newPassword: "a brand new password",
          }),
        ).toEqual({
          ok: true,
          value: undefined,
        });
        expect(await browser.getUser()).toMatchObject({ id: user.id });
        expect(await elsewhere.getUser()).toBeNull();
        const other = await harness.browser();
        expect(
          await other.signInWithPassword({ email, password: "a brand new password" }),
        ).toMatchObject({ ok: true });
      },
      timeout,
    );

    it(
      "deletes the account only with the right password, after beforeDelete",
      async () => {
        const harness = await setup();
        const { email, browser } = await account(harness);
        if (!browser.canDeleteAccount) {
          expect(await browser.deleteAccount({ password })).toEqual({
            ok: false,
            error: "not-supported",
          });
          return;
        }
        const beforeDelete = vi.fn(async () => {});
        expect(
          await browser.deleteAccount({ password: "not the password at all", beforeDelete }),
        ).toEqual({
          ok: false,
          error: "invalid-password",
        });
        expect(beforeDelete).not.toHaveBeenCalled();
        expect(await browser.deleteAccount({ password, beforeDelete })).toEqual({
          ok: true,
          value: undefined,
        });
        expect(beforeDelete).toHaveBeenCalledOnce();
        expect(await browser.getUser()).toBeNull();
        expect(await (await harness.browser()).signInWithPassword({ email, password })).toEqual({
          ok: false,
          error: "invalid-credentials",
        });
      },
      timeout,
    );

    it(
      "keeps the account when beforeDelete throws",
      async () => {
        const harness = await setup();
        const { email, browser } = await account(harness);
        if (!browser.canDeleteAccount) return;
        await expect(
          browser.deleteAccount({
            password,
            beforeDelete: async () => {
              throw new Error("the app's data could not be removed");
            },
          }),
        ).rejects.toThrow(/could not be removed/);
        expect((await (await harness.browser()).signInWithPassword({ email, password })).ok).toBe(
          true,
        );
      },
      timeout,
    );

    it(
      "refuses account settings without a session",
      async () => {
        const harness = await setup();
        const browser = await harness.browser();
        expect(
          await browser.changePassword({
            currentPassword: password,
            newPassword: "a brand new password",
          }),
        ).toEqual({
          ok: false,
          error: "not-signed-in",
        });
        const deleted = await browser.deleteAccount({ password });
        expect(deleted).toEqual({
          ok: false,
          error: browser.canDeleteAccount ? "not-signed-in" : "not-supported",
        });
      },
      timeout,
    );

    it(
      "rejects a code that isn't the provider's",
      async () => {
        const harness = await setup();
        expect(await (await harness.browser()).exchangeCodeForSession("not-a-code")).toEqual({
          ok: false,
          error: "invalid-code",
        });
      },
      timeout,
    );
  });
}

import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import {
  passwordResetEmail,
  verificationEmail,
  type AuthEmailSender,
  type AuthProvider,
  type AuthUser,
  type CookieStore,
} from "@clubedge/auth";
import { err, ok, reportError } from "@clubedge/core";

// Firebase Authentication, run from the server: Identity Toolkit's REST API checks passwords and
// creates accounts, and firebase-admin turns the ID token into a session cookie it verifies (and
// checks for revocation) on each request. Reset and verification links are generated with the
// Admin SDK and sent through the app's email provider, so they open the app's own pages and need
// no setup in the Firebase console.

export interface FirebaseAuthConfig {
  /** The Firebase project id; with the emulator, any `demo-` id. */
  projectId: string;
  /** The project's Web API key (Project settings, General), for Identity Toolkit's REST API. */
  apiKey: string;
  /** A service account (Project settings, Service accounts); not needed with the emulator. */
  clientEmail?: string;
  privateKey?: string;
  /** The Auth Emulator's host:port (FIREBASE_AUTH_EMULATOR_HOST), for development and tests. */
  emulatorHost?: string;
  cookies: CookieStore;
  /** The app's origin, for the links in emails. */
  baseUrl: string;
  /** Sends verification and reset emails; without it, password reset is off. */
  sendEmail?: AuthEmailSender;
  appName?: string;
  /** How long a session lasts, from 1 to 14 days. Default 5. */
  sessionDays?: number;
  /** For tests: the fetch used for Identity Toolkit's REST API. */
  fetch?: typeof fetch;
}

export const SESSION_COOKIE = "__session";

/** An Identity Toolkit error, by its code: EMAIL_NOT_FOUND, INVALID_PASSWORD, ... */
class IdentityError extends Error {
  constructor(readonly code: string) {
    super(`Firebase Auth: ${code}`);
  }
}

// What a wrong address or password returns, with and without email enumeration protection.
const BAD_CREDENTIALS = new Set([
  "EMAIL_NOT_FOUND",
  "INVALID_PASSWORD",
  "INVALID_LOGIN_CREDENTIALS",
  "USER_DISABLED",
]);

/** One firebase-admin app per project, shared by every request. */
function adminApp({ projectId, clientEmail, privateKey, emulatorHost }: FirebaseAuthConfig): App {
  // firebase-admin reads the emulator's host from the environment when Auth is first used.
  if (emulatorHost) process.env.FIREBASE_AUTH_EMULATOR_HOST ??= emulatorHost;
  const name = `clubedge-${projectId}`;
  const existing = getApps().find((app) => app.name === name);
  if (existing) return existing;
  if (!emulatorHost && !(clientEmail && privateKey)) {
    throw new Error(
      "Firebase Auth needs a service account (FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY).",
    );
  }
  return initializeApp(
    emulatorHost
      ? { projectId }
      : {
          projectId,
          credential: cert({
            projectId,
            clientEmail,
            privateKey: privateKey!.replace(/\\n/g, "\n"),
          }),
        },
    name,
  );
}

/** The oobCode in a link firebase-admin generated. */
const oobCodeOf = (link: string) => new URL(link).searchParams.get("oobCode");

export function createFirebaseAuth(config: FirebaseAuthConfig): AuthProvider {
  const {
    apiKey,
    emulatorHost,
    cookies,
    baseUrl,
    sendEmail,
    appName = "the app",
    fetch: fetcher = fetch,
  } = config;
  const sessionMs = Math.min(Math.max(config.sessionDays ?? 5, 1), 14) * 24 * 3600 * 1000;
  const admin: Auth = getAuth(adminApp(config));
  const identity = emulatorHost
    ? `http://${emulatorHost}/identitytoolkit.googleapis.com`
    : "https://identitytoolkit.googleapis.com";
  const secure = baseUrl.startsWith("https://");

  async function rest<T>(operation: string, body: object): Promise<T> {
    const response = await fetcher(
      `${identity}/v1/${operation}?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      },
    );
    const data = (await response.json().catch(() => ({}))) as T & { error?: { message?: string } };
    if (!response.ok)
      throw new IdentityError(String(data.error?.message ?? response.status).split(/[\s:]/)[0]!);
    return data;
  }

  const signIn = (email: string, password: string) =>
    rest<{ idToken: string; localId: string; email: string }>("accounts:signInWithPassword", {
      email,
      password,
      returnSecureToken: true,
    });

  async function startSession(idToken: string) {
    const value = await admin.createSessionCookie(idToken, { expiresIn: sessionMs });
    cookies.setAll([
      {
        name: SESSION_COOKIE,
        value,
        options: { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: sessionMs / 1000 },
      },
    ]);
  }

  function endSession() {
    cookies.setAll([
      {
        name: SESSION_COOKIE,
        value: "",
        options: { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 0 },
      },
    ]);
  }

  /** The verified session's user id and email, or null; a revoked or expired session is null. */
  async function session(): Promise<{ uid: string; email: string | null } | null> {
    const value = cookies.getAll().find((cookie) => cookie.name === SESSION_COOKIE)?.value;
    if (!value) return null;
    try {
      const claims = await admin.verifySessionCookie(value, true);
      return { uid: claims.uid, email: claims.email ?? null };
    } catch {
      return null;
    }
  }

  /**
   * Ends every session of the user. Revocation is recorded to the second, and a session that
   * started in the same second would survive it, so it waits for the next second first.
   */
  async function revokeSessions(uid: string) {
    await new Promise((resolve) => setTimeout(resolve, 1_050 - (Date.now() % 1_000)));
    await admin.revokeRefreshTokens(uid);
  }

  /** Sends an email without making the request wait for the email provider, or fail with it. */
  function send(email: Parameters<AuthEmailSender>[0]) {
    void sendEmail?.(email).catch((error: unknown) =>
      reportError(error, { message: "Firebase Auth: an email could not be sent." }),
    );
  }

  return {
    canResetPassword: Boolean(sendEmail),
    canDeleteAccount: true,

    async getUser(): Promise<AuthUser | null> {
      const current = await session();
      return current ? { id: current.uid, email: current.email } : null;
    },

    async signInWithPassword({ email, password }) {
      try {
        const signedIn = await signIn(email, password);
        await startSession(signedIn.idToken);
        return ok({ id: signedIn.localId, email: signedIn.email });
      } catch (error) {
        if (error instanceof IdentityError && BAD_CREDENTIALS.has(error.code))
          return err("invalid-credentials");
        throw error;
      }
    },

    async signUp({ email, password, emailRedirectTo }) {
      let created: { idToken: string; localId: string; email: string };
      try {
        created = await rest("accounts:signUp", { email, password, returnSecureToken: true });
      } catch (error) {
        if (error instanceof IdentityError) return err("signup-failed");
        throw error;
      }
      await startSession(created.idToken);
      // Sign-in doesn't wait for it: the link confirms the address through the auth callback.
      if (sendEmail) {
        void admin
          .generateEmailVerificationLink(email)
          .then((link) => {
            const url = new URL(emailRedirectTo);
            url.searchParams.set("code", oobCodeOf(link) ?? "");
            send(verificationEmail({ to: email, url: url.toString(), appName }));
          })
          .catch((error: unknown) =>
            reportError(error, { message: "Firebase Auth: no verification link." }),
          );
      }
      return ok({ user: { id: created.localId, email: created.email }, needsConfirmation: false });
    },

    async exchangeCodeForSession(code) {
      // Applies an email verification code; the browser keeps the session it had.
      try {
        await rest("accounts:update", { oobCode: code });
        return ok(null);
      } catch (error) {
        if (error instanceof IdentityError) return err("invalid-code");
        throw error;
      }
    },

    async requestPasswordReset({ email }) {
      if (!sendEmail) return;
      try {
        const code = oobCodeOf(await admin.generatePasswordResetLink(email));
        if (!code) return;
        const url = new URL("/reset-password", baseUrl);
        url.searchParams.set("token", code);
        send(passwordResetEmail({ to: email, url: url.toString(), appName }));
      } catch (error) {
        // Never reveal whether the address has an account.
        const code = (error as { code?: string }).code;
        if (code !== "auth/email-not-found" && code !== "auth/user-not-found") {
          reportError(error, { message: "Firebase Auth: no password reset link." });
        }
      }
    },

    async resetPassword({ password, token }) {
      if (!token) return err("invalid-reset");
      try {
        const { email } = await rest<{ email: string }>("accounts:resetPassword", {
          oobCode: token,
          newPassword: password,
        });
        // Other sessions end with the old password.
        const user = await admin.getUserByEmail(email).catch(() => null);
        if (user) await revokeSessions(user.uid);
        return ok(undefined);
      } catch (error) {
        if (error instanceof IdentityError) return err("invalid-reset");
        throw error;
      }
    },

    async changePassword({ currentPassword, newPassword }) {
      const current = await session();
      if (!current?.email) return err("not-signed-in");
      let idToken: string;
      try {
        idToken = (await signIn(current.email, currentPassword)).idToken;
      } catch (error) {
        if (error instanceof IdentityError && BAD_CREDENTIALS.has(error.code))
          return err("invalid-password");
        throw error;
      }
      await rest("accounts:update", { idToken, password: newPassword, returnSecureToken: true });
      // Ends every session, then signs this browser in again after the revocation's second.
      await revokeSessions(current.uid);
      await new Promise((resolve) => setTimeout(resolve, 1_100));
      await startSession((await signIn(current.email, newPassword)).idToken);
      return ok(undefined);
    },

    async deleteAccount({ password, beforeDelete }) {
      const current = await session();
      if (!current?.email) return err("not-signed-in");
      try {
        await signIn(current.email, password);
      } catch (error) {
        if (error instanceof IdentityError && BAD_CREDENTIALS.has(error.code))
          return err("invalid-password");
        throw error;
      }
      await beforeDelete?.();
      await admin.deleteUser(current.uid);
      endSession();
      return ok(undefined);
    },

    // Session cookies last until they expire or are revoked; getUser checks both.
    async refreshSession() {},

    async signOut() {
      endSession();
    },
  };
}

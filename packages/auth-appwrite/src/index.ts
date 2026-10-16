import { Account, AppwriteException, Client, ID, Users } from "node-appwrite";
import { splitLinkToken, type AuthProvider, type AuthUser, type CookieStore } from "@clubedge/auth";
import { err, ok, reportError } from "@clubedge/core";

// Appwrite's accounts, run from the server: an API key creates sessions, accounts, and recovery
// tokens, and the session's secret is kept in an HTTP-only cookie, from which each request makes
// a client acting as the user. Appwrite sends the verification and recovery emails itself (its
// SMTP settings), with links that carry userId and secret back to the app's own pages.

export interface AppwriteAuthConfig {
  /** The API endpoint, such as https://cloud.appwrite.io/v1 or your server's /v1. */
  endpoint: string;
  projectId: string;
  /** An API key with the sessions.write and users.write scopes. */
  apiKey: string;
  cookies: CookieStore;
  /** The app's origin: recovery links open its /reset-password page. */
  baseUrl: string;
}

const isAppwrite = (error: unknown, ...types: string[]) =>
  error instanceof AppwriteException && types.includes(error.type);

// A wrong password, an unknown address, or a blocked account: one answer for all.
const BAD_CREDENTIALS = ["user_invalid_credentials", "user_blocked", "user_not_found"];

export function createAppwriteAuth({
  endpoint,
  projectId,
  apiKey,
  cookies,
  baseUrl,
}: AppwriteAuthConfig): AuthProvider {
  const cookieName = `a_session_${projectId}`;
  const secure = baseUrl.startsWith("https://");
  const admin = () => new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
  const asUser = (secret: string) =>
    new Client().setEndpoint(endpoint).setProject(projectId).setSession(secret);

  const sessionSecret = () =>
    cookies.getAll().find((cookie) => cookie.name === cookieName)?.value || null;

  function keepSession(secret: string, expire: string) {
    cookies.setAll([
      {
        name: cookieName,
        value: secret,
        options: { httpOnly: true, secure, sameSite: "lax", path: "/", expires: new Date(expire) },
      },
    ]);
  }

  function endSession() {
    cookies.setAll([
      {
        name: cookieName,
        value: "",
        options: { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 0 },
      },
    ]);
  }

  /** A new session for the address and password, or null when Appwrite refuses them. */
  async function createSession(email: string, password: string) {
    try {
      return await new Account(admin()).createEmailPasswordSession({ email, password });
    } catch (error) {
      if (isAppwrite(error, ...BAD_CREDENTIALS)) return null;
      throw error;
    }
  }

  /** The signed-in user, from Appwrite, or null without a valid session. */
  async function currentUser() {
    const secret = sessionSecret();
    if (!secret) return null;
    try {
      return { user: await new Account(asUser(secret)).get(), secret };
    } catch (error) {
      if (error instanceof AppwriteException && error.code === 401) return null;
      throw error;
    }
  }

  return {
    canResetPassword: true,
    canDeleteAccount: true,

    async getUser(): Promise<AuthUser | null> {
      const current = await currentUser();
      return current ? { id: current.user.$id, email: current.user.email || null } : null;
    },

    async signInWithPassword({ email, password }) {
      const session = await createSession(email, password);
      if (!session) return err("invalid-credentials");
      keepSession(session.secret, session.expire);
      return ok({ id: session.userId, email });
    },

    async signUp({ email, password, emailRedirectTo }) {
      let userId: string;
      try {
        userId = (await new Account(admin()).create({ userId: ID.unique(), email, password })).$id;
      } catch (error) {
        // An address that has an account, a password Appwrite's policy refuses, ...
        if (error instanceof AppwriteException && error.code >= 400 && error.code < 500)
          return err("signup-failed");
        throw error;
      }
      const session = await createSession(email, password);
      if (!session) return err("signup-failed");
      keepSession(session.secret, session.expire);
      // Appwrite emails a link to the auth callback, which confirms the address.
      void new Account(asUser(session.secret))
        .createEmailVerification({ url: emailRedirectTo })
        .catch((error: unknown) =>
          reportError(error, { message: "Appwrite: no verification email." }),
        );
      return ok({ user: { id: userId, email }, needsConfirmation: false });
    },

    async exchangeCodeForSession(code) {
      const link = splitLinkToken(code);
      if (!link) return err("invalid-code");
      try {
        await new Account(admin()).updateEmailVerification(link);
        return ok(null);
      } catch (error) {
        if (error instanceof AppwriteException && error.code >= 400 && error.code < 500)
          return err("invalid-code");
        throw error;
      }
    },

    async requestPasswordReset({ email }) {
      try {
        // Appwrite appends userId, secret, and expire to the URL; unknown addresses get the
        // same answer and no email.
        await new Account(admin()).createRecovery({
          email,
          url: new URL("/reset-password", baseUrl).toString(),
        });
      } catch (error) {
        reportError(error, { message: "Appwrite: no password recovery email." });
      }
    },

    async resetPassword({ password, token }) {
      const link = token ? splitLinkToken(token) : null;
      if (!link) return err("invalid-reset");
      try {
        await new Account(admin()).updateRecovery({ ...link, password });
      } catch (error) {
        if (error instanceof AppwriteException && error.code >= 400 && error.code < 500)
          return err("invalid-reset");
        throw error;
      }
      // Other sessions end with the old password.
      await new Users(admin()).deleteSessions({ userId: link.userId });
      return ok(undefined);
    },

    async changePassword({ currentPassword, newPassword }) {
      const current = await currentUser();
      if (!current) return err("not-signed-in");
      const account = new Account(asUser(current.secret));
      try {
        await account.updatePassword({ password: newPassword, oldPassword: currentPassword });
      } catch (error) {
        if (isAppwrite(error, "user_invalid_credentials")) return err("invalid-password");
        throw error;
      }
      await account.deleteSessions({ current: false });
      return ok(undefined);
    },

    async deleteAccount({ password, beforeDelete }) {
      const current = await currentUser();
      if (!current) return err("not-signed-in");
      const check = await createSession(current.user.email, password);
      if (!check) return err("invalid-password");
      const users = new Users(admin());
      await users.deleteSession({ userId: current.user.$id, sessionId: check.$id });
      await beforeDelete?.();
      await users.delete({ userId: current.user.$id });
      endSession();
      return ok(undefined);
    },

    // Sessions last until they expire or are deleted; getUser asks Appwrite each time.
    async refreshSession() {},

    async signOut() {
      const secret = sessionSecret();
      if (secret) {
        await new Account(asUser(secret)).deleteSession({ sessionId: "current" }).catch(() => {});
      }
      endSession();
    },
  };
}

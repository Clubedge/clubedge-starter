import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { parseSetCookieHeader, splitSetCookieHeader, toCookieOptions } from "better-auth/cookies";
import {
  passwordResetEmail,
  verificationEmail,
  type AuthEmailSender,
  type AuthProvider,
  type AuthUser,
  type CookieStore,
  type CookieToSet,
} from "@clubedge/auth";
import { err, ok, reportError } from "@clubedge/core";
import { betterAuthTables } from "./schema";

// The email types and templates live in @clubedge/auth; re-exported for existing imports.
export {
  passwordResetEmail,
  verificationEmail,
  type AuthEmail,
  type AuthEmailSender,
} from "@clubedge/auth";
export { betterAuthTables } from "./schema";

type DatabaseAdapter = Parameters<typeof betterAuth>[0]["database"];

export interface BetterAuthServerConfig {
  /** Where Better Auth stores users and sessions; see `drizzleDatabase`. */
  database: DatabaseAdapter;
  /** At least 32 random characters, for signing session cookies. */
  secret: string;
  /** The app's public origin, such as https://app.example. */
  baseUrl: string;
  /**
   * Sends verification and password reset emails. Without it, sign-up never asks for
   * verification and password reset is unavailable.
   */
  sendEmail?: AuthEmailSender;
  /** Refuse sign-in until the email address is confirmed. Needs `sendEmail`. */
  requireEmailVerification?: boolean;
  /** The product name used in email subjects. */
  appName?: string;
  /**
   * Where emailed links lead. "pages", the default: the app's own pages at `baseUrl`,
   * /reset-password and /auth/callback. "endpoints": Better Auth's own endpoints at `baseUrl`,
   * which check the link, then open the address the client asked for, such as its mobile app's,
   * for an API that has no pages.
   */
  emailLinks?: "pages" | "endpoints";
  /**
   * A native app's address scheme, such as my-product: its requests, which carry the scheme, are
   * trusted, and Better Auth's Expo plugin lets it keep the session cookie on the device.
   */
  mobileAppScheme?: string;
  /** Better Auth's own delete-user endpoint; turn it off where the app deletes accounts itself. */
  deleteUser?: boolean;
}

/** Stores Better Auth's tables in a Drizzle PostgreSQL database (see ./schema). */
export function drizzleDatabase(db: Parameters<typeof drizzleAdapter>[0]): DatabaseAdapter {
  return drizzleAdapter(db, { provider: "pg", schema: betterAuthTables });
}

/**
 * Sends without waiting, so how long a request takes does not reveal whether an account
 * exists. Failures are logged, never shown to the visitor.
 */
function sendInBackground(sendEmail: AuthEmailSender, email: Parameters<AuthEmailSender>[0]) {
  void sendEmail(email).catch((error: unknown) =>
    reportError(error, { message: "Could not send auth email" }),
  );
}

/** One Better Auth server per process; `createBetterAuth` adapts it per request. */
export function createBetterAuthServer({
  database,
  secret,
  baseUrl,
  sendEmail,
  requireEmailVerification = false,
  appName = "App",
  emailLinks = "pages",
  mobileAppScheme,
  deleteUser = true,
}: BetterAuthServerConfig) {
  const link = (path: string, params: Record<string, string>) => {
    const url = new URL(path, baseUrl);
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
    return url.toString();
  };
  // Better Auth's link to its own endpoint, or the app's page for the same token.
  const emailed = (endpoint: string, page: string) =>
    emailLinks === "endpoints" ? endpoint : page;
  return betterAuth({
    database,
    secret,
    baseURL: baseUrl,
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      requireEmailVerification: Boolean(sendEmail) && requireEmailVerification,
      ...(sendEmail
        ? {
            resetPasswordTokenExpiresIn: 60 * 60,
            // The link opens the app's reset page, which sends the token back with the new password.
            sendResetPassword: async ({ user, token, url }) =>
              sendInBackground(
                sendEmail,
                passwordResetEmail({
                  to: user.email,
                  url: emailed(url, link("/reset-password", { token })),
                  appName,
                }),
              ),
          }
        : {}),
    },
    ...(sendEmail
      ? {
          emailVerification: {
            sendOnSignUp: true,
            autoSignInAfterVerification: true,
            // The link goes through the app's auth callback, like Supabase's confirmation links.
            sendVerificationEmail: async ({ user, token, url }) =>
              sendInBackground(
                sendEmail,
                verificationEmail({
                  to: user.email,
                  url: emailed(url, link("/auth/callback", { code: token })),
                  appName,
                }),
              ),
          },
        }
      : {}),
    // Deleting an account needs the user's password (checked by deleteAccount below).
    user: { deleteUser: { enabled: deleteUser } },
    advanced: { database: { generateId: "uuid" } },
    // Keep Better Auth's provider-level throttling enabled for every host, including the
    // decoupled Vite auth endpoint. Frameworks may add stricter per-client limits as well.
    rateLimit: { enabled: true },
    trustedOrigins: mobileAppScheme ? [`${mobileAppScheme}://`] : [],
    plugins: mobileAppScheme ? [expo()] : [],
  });
}

export type BetterAuthServer = ReturnType<typeof createBetterAuthServer>;

function toAuthUser(user: { id: string; email: string }): AuthUser {
  return { id: user.id, email: user.email };
}

/** The request's cookies, in the form Better Auth reads them. */
function requestHeaders(cookies: CookieStore): Headers {
  const header = cookies
    .getAll()
    .map(({ name, value }) => `${name}=${encodeURIComponent(value)}`)
    .join("; ");
  return new Headers(header ? { cookie: header } : {});
}

/** Writes every cookie Better Auth set through the framework's cookie store. */
function applyCookies(cookies: CookieStore, headers: Headers) {
  const header = headers.get("set-cookie");
  if (!header) return;
  const values: CookieToSet[] = splitSetCookieHeader(header).flatMap((cookie) =>
    [...parseSetCookieHeader(cookie)].map(([name, attributes]) => ({
      name,
      value: attributes.value,
      options: toCookieOptions(attributes),
    })),
  );
  if (values.length) cookies.setAll(values);
}

/** Better Auth reports expected failures, such as a wrong password, as API errors. */
function isApiError(error: unknown): boolean {
  return error instanceof Error && error.name === "APIError";
}

function apiErrorCode(error: unknown): string | undefined {
  const body = (error as { body?: { code?: unknown } }).body;
  return typeof body?.code === "string" ? body.code : undefined;
}

/** The cookies a response set, as a request header, to read the session they created. */
function responseCookieHeaders(headers: Headers): Headers {
  const cookies = splitSetCookieHeader(headers.get("set-cookie") ?? "").flatMap((cookie) =>
    // Values come back decoded; encode them as requestHeaders does.
    [...parseSetCookieHeader(cookie)].map(
      ([name, attributes]) => `${name}=${encodeURIComponent(attributes.value)}`,
    ),
  );
  return new Headers(cookies.length ? { cookie: cookies.join("; ") } : {});
}

export function createBetterAuth({
  server,
  cookies,
}: {
  server: BetterAuthServer;
  cookies: CookieStore;
}): AuthProvider {
  const canResetPassword = Boolean(server.options.emailAndPassword?.sendResetPassword);
  return {
    canResetPassword,
    async getUser() {
      const session = await server.api.getSession({ headers: requestHeaders(cookies) });
      return session ? toAuthUser(session.user) : null;
    },
    async signInWithPassword(credentials) {
      try {
        const { headers, response } = await server.api.signInEmail({
          body: credentials,
          headers: requestHeaders(cookies),
          returnHeaders: true,
        });
        applyCookies(cookies, headers);
        return ok(toAuthUser(response.user));
      } catch (error) {
        if (isApiError(error) && apiErrorCode(error) === "EMAIL_NOT_VERIFIED")
          return err("email-not-verified");
        if (isApiError(error)) return err("invalid-credentials");
        throw error;
      }
    },
    async signUp({ email, password }) {
      try {
        const { headers, response } = await server.api.signUpEmail({
          // Better Auth requires a display name; start with the email's local part.
          body: { email, password, name: email.split("@")[0] ?? email },
          headers: requestHeaders(cookies),
          returnHeaders: true,
        });
        applyCookies(cookies, headers);
        // Without required verification, sign-up signs the user in and returns a session token.
        return ok({ user: toAuthUser(response.user), needsConfirmation: !response.token });
      } catch (error) {
        if (isApiError(error)) return err("signup-failed");
        throw error;
      }
    },
    async exchangeCodeForSession(code) {
      // The code is an email verification token; verifying it also signs the user in.
      try {
        const { headers } = await server.api.verifyEmail({
          query: { token: code },
          headers: requestHeaders(cookies),
          returnHeaders: true,
        });
        applyCookies(cookies, headers);
        const session = await server.api.getSession({ headers: responseCookieHeaders(headers) });
        return ok(session ? toAuthUser(session.user) : null);
      } catch (error) {
        if (isApiError(error)) return err("invalid-code");
        throw error;
      }
    },
    async requestPasswordReset({ email }) {
      if (!canResetPassword) return;
      try {
        // sendResetPassword (above) builds the link to the app's /reset-password page.
        await server.api.requestPasswordReset({ body: { email } });
      } catch (error) {
        // Never reveal whether the address has an account.
        if (!isApiError(error)) throw error;
      }
    },
    async resetPassword({ password, token }) {
      if (!token) return err("invalid-reset");
      try {
        await server.api.resetPassword({ body: { newPassword: password, token } });
        return ok(undefined);
      } catch (error) {
        if (isApiError(error)) return err("invalid-reset");
        throw error;
      }
    },
    async changePassword({ currentPassword, newPassword }) {
      try {
        const { headers } = await server.api.changePassword({
          body: { currentPassword, newPassword, revokeOtherSessions: true },
          headers: requestHeaders(cookies),
          returnHeaders: true,
        });
        // Revoking the other sessions issues this one a new session cookie.
        applyCookies(cookies, headers);
        return ok(undefined);
      } catch (error) {
        if (isApiError(error) && apiErrorCode(error) === "INVALID_PASSWORD")
          return err("invalid-password");
        if (isApiError(error)) return err("not-signed-in");
        throw error;
      }
    },
    canDeleteAccount: true,
    async deleteAccount({ password, beforeDelete }) {
      try {
        await server.api.verifyPassword({ body: { password }, headers: requestHeaders(cookies) });
        await beforeDelete?.();
        const { headers } = await server.api.deleteUser({
          body: { password },
          headers: requestHeaders(cookies),
          returnHeaders: true,
        });
        applyCookies(cookies, headers);
        return ok(undefined);
      } catch (error) {
        if (isApiError(error) && apiErrorCode(error) === "INVALID_PASSWORD")
          return err("invalid-password");
        if (isApiError(error)) return err("not-signed-in");
        throw error;
      }
    },
    async refreshSession() {
      // Reading the session extends it when due and returns the refreshed cookies.
      const { headers } = await server.api.getSession({
        headers: requestHeaders(cookies),
        returnHeaders: true,
      });
      applyCookies(cookies, headers);
    },
    async signOut() {
      const { headers } = await server.api.signOut({
        headers: requestHeaders(cookies),
        returnHeaders: true,
      });
      applyCookies(cookies, headers);
    },
  };
}

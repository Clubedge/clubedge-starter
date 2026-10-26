import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import * as Linking from "expo-linking"; // clubedge:only framework=none
import * as SecureStore from "expo-secure-store";
import site from "@/config/site.json";
import {
  AccountError,
  EmailNotVerifiedError,
  signOutEverywhereFailed,
  type AuthClient,
} from "@/lib/auth-client";
import { apiUrl } from "@/lib/config";

type BetterAuthError = { status: number; code?: string; message?: string };

/** Better Auth's refusals the settings screen can explain, or an error with its message. */
function accountError(error: BetterAuthError): Error {
  if (error.status === 429) return new AccountError("rate-limited");
  if (error.code === "INVALID_PASSWORD") return new AccountError("invalid-password");
  if (error.code === "PASSWORD_TOO_SHORT" || error.code === "PASSWORD_TOO_LONG") {
    return new AccountError("invalid-input");
  }
  return new Error(error.message ?? "The account could not be changed.");
}

// clubedge:if framework!=none
// Better Auth runs on the website. Its Expo plugin keeps the session cookie in the device's
// secure storage and sends it, with the app's own address (its scheme, from app.config.ts), on
// every sign-in request; the website's Better Auth trusts that scheme.
// clubedge:end
// clubedge:if framework=none
// Better Auth runs in the API. Its Expo plugin keeps the session cookie in the device's secure
// storage and sends it, with the app's own address (its scheme, from app.config.ts), on every
// sign-in request; the API's Better Auth trusts that scheme.
// clubedge:end
const client = createAuthClient({
  baseURL: apiUrl,
  plugins: [expoClient({ storagePrefix: site.serviceId, storage: SecureStore })],
});

export const authClient: AuthClient = {
  configured: true,
  async hasSession() {
    // Better Auth's answer or, when the server cannot be reached or answers with an error, the
    // session cookie the device keeps.
    const result = await client.getSession().catch(() => null);
    if (!result || result.error) return (await client.getCookie()).includes("session_token=");
    return Boolean(result.data?.session);
  },
  async sessionHeaders(): Promise<Record<string, string>> {
    const cookie = await client.getCookie();
    return cookie ? { cookie } : {};
  },
  async signIn(email, password) {
    const result = await client.signIn.email({ email, password });
    if (result.error?.code === "EMAIL_NOT_VERIFIED") throw new EmailNotVerifiedError();
    if (result.error) throw new Error(result.error.message ?? "Sign in failed.");
  },
  async signUp({ email, password, redirectTo }) {
    // The emailed link confirms the address, then opens redirectTo; Better Auth's default page
    // without it.
    const result = await client.signUp.email({
      email,
      password,
      name: email.split("@")[0] ?? email,
      callbackURL: redirectTo,
    });
    if (result.error) throw new Error(result.error.message ?? "Sign up failed.");
    return { needsConfirmation: !result.data?.token };
  },
  async requestPasswordReset({ email, redirectTo }) {
    // Without redirectTo, the server's Better Auth builds the link, to its own reset page.
    const result = await client.requestPasswordReset({ email, redirectTo });
    if (result.error) throw new Error(result.error.message ?? "Password reset failed.");
  },
  // clubedge:if framework=none
  async resetPassword(link, newPassword) {
    // The API's Better Auth checked the emailed link, then opened this app with its token, or
    // with an error once the link has expired or been used.
    const { token, error } = Linking.parse(link).queryParams ?? {};
    if (error || typeof token !== "string") {
      throw new Error("This link has expired or was already used: ask for a new one.");
    }
    const result = await client.resetPassword({ newPassword, token });
    if (result.error) throw accountError(result.error);
    return { signedIn: false };
  },
  // clubedge:end
  async changePassword(currentPassword, newPassword) {
    // Revoking the other sessions answers with a new session cookie, which the plugin keeps.
    const result = await client.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    });
    if (result.error) throw accountError(result.error);
  },
  async signOut(options) {
    if (options?.everywhere) {
      // Every session of the user ends on the server first, this one included.
      const result = await client.revokeSessions().catch(() => null);
      if (!result || result.error) throw new Error(signOutEverywhereFailed);
    }
    // The plugin forgets the session on the device before it asks the server to end it, so the
    // device is signed out even when the server cannot be reached.
    await client.signOut().catch(() => undefined);
  },
};

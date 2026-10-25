import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";
import site from "@/config/site.json";
import { AccountError, EmailNotVerifiedError, type AuthClient } from "@/lib/auth-client";
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

// Better Auth runs on the website. Its Expo plugin keeps the session cookie in the device's
// secure storage and sends it, with the app's own address (its scheme, from app.config.ts), on
// every sign-in request; the website's Better Auth trusts that scheme.
const client = createAuthClient({
  baseURL: apiUrl,
  plugins: [expoClient({ storagePrefix: site.serviceId, storage: SecureStore })],
});

export const authClient: AuthClient = {
  configured: true,
  async hasSession() {
    const { data } = await client.getSession();
    return Boolean(data?.session);
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
  async signUp(email, password) {
    // No callbackURL: the emailed link confirms the address on the website and opens its home
    // page, rather than a link back into the app, which only works on this phone.
    const result = await client.signUp.email({
      email,
      password,
      name: email.split("@")[0] ?? email,
    });
    if (result.error) throw new Error(result.error.message ?? "Sign up failed.");
    return { needsConfirmation: !result.data?.token };
  },
  async requestPasswordReset(email) {
    // The website's Better Auth builds the link, to its own reset page.
    const result = await client.requestPasswordReset({ email });
    if (result.error) throw new Error(result.error.message ?? "Password reset failed.");
  },
  async changePassword(currentPassword, newPassword) {
    // Revoking the other sessions answers with a new session cookie, which the plugin keeps.
    const result = await client.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    });
    if (result.error) throw accountError(result.error);
  },
  async signOut() {
    // The plugin forgets the session on the device, even when the server cannot be reached.
    await client.signOut();
  },
};

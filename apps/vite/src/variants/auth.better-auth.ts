import { createAuthClient } from "better-auth/react";
import { AccountError, type AuthClient } from "@/lib/auth-client";

type BetterAuthError = { status: number; code?: string; message?: string };

/** Better Auth's refusals the settings page can explain, or an error with its message. */
function accountError(error: BetterAuthError): Error {
  if (error.status === 429) return new AccountError("rate-limited");
  if (error.code === "INVALID_PASSWORD") return new AccountError("invalid-password");
  if (error.code === "PASSWORD_TOO_SHORT" || error.code === "PASSWORD_TOO_LONG") {
    return new AccountError("invalid-input");
  }
  return new Error(error.message ?? "The account could not be changed.");
}

const baseURL = window.location.origin;
const configured = true;
const client = createAuthClient({ baseURL });

export const authClient: AuthClient = {
  configured,
  // Better Auth uses its same-origin, HttpOnly session cookie; no bearer token is exposed.
  async getAccessToken() {
    return undefined;
  },
  async signIn(email, password) {
    const result = await client.signIn.email({ email, password });
    if (result.error?.code === "EMAIL_NOT_VERIFIED") {
      const error = new Error("Your email is not verified yet.");
      error.name = "EmailVerificationRequiredError";
      throw error;
    }
    if (result.error) throw new Error(result.error.message ?? "Sign in failed.");
  },
  async signUp(email, password, returnUrl) {
    const result = await client.signUp.email({
      email,
      password,
      name: email.split("@")[0] ?? email,
      // The emailed link confirms the address in Better Auth's server and signs the user in,
      // then opens this page: where the user was going, rather than the login page.
      callbackURL: new URL(returnUrl).searchParams.get("next") ?? "/dashboard",
    });
    if (result.error) throw new Error(result.error.message ?? "Sign up failed.");
    return { needsConfirmation: !result.data?.token };
  },
  async requestPasswordReset(email, returnUrl) {
    const result = await client.requestPasswordReset({ email, redirectTo: returnUrl });
    if (result.error) throw new Error(result.error.message ?? "Password reset failed.");
  },
  async resetPassword(password, params) {
    const token = params.get("token");
    if (!token) throw new Error("The reset link is missing its token.");
    const result = await client.resetPassword({ newPassword: password, token });
    if (result.error) throw new Error(result.error.message ?? "Password reset failed.");
  },
  async changePassword(currentPassword, newPassword) {
    // Better Auth's server limits these per address; revoking the other sessions issues this
    // browser a new session cookie.
    const result = await client.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    });
    if (result.error) throw accountError(result.error);
  },
  async signOut() {
    const result = await client.signOut();
    if (result.error) throw new Error(result.error.message ?? "Sign out failed.");
  },
};

export const getAccessToken = () => authClient.getAccessToken();

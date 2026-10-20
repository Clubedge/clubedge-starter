import { createAuthClient } from "better-auth/react";
import type { AuthClient } from "@/lib/auth-client";

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
    if (result.error) throw new Error(result.error.message ?? "Sign in failed.");
  },
  async signUp(email, password, returnUrl) {
    const result = await client.signUp.email({
      email,
      password,
      name: email.split("@")[0] ?? email,
      callbackURL: returnUrl,
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
  async signOut() {
    const result = await client.signOut();
    if (result.error) throw new Error(result.error.message ?? "Sign out failed.");
  },
};

export const getAccessToken = () => authClient.getAccessToken();

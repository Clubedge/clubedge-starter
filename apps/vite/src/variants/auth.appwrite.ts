import { Account, AppwriteException, Client, ID } from "appwrite";
import { AccountError, type AuthClient } from "@/lib/auth-client";
import { publicOrigin } from "@/lib/public-origin";

const endpoint = import.meta.env.VITE_APPWRITE_ENDPOINT;
const projectId = import.meta.env.VITE_APPWRITE_PROJECT_ID;
const configured = Boolean(endpoint && projectId);
const account = configured
  ? new Account(new Client().setEndpoint(endpoint).setProject(projectId))
  : undefined;

function verificationUrl(returnUrl: string): string {
  const url = new URL(returnUrl);
  url.searchParams.set("next", "/dashboard");
  return url.toString();
}

export const authClient: AuthClient = {
  configured,
  async getAccessToken() {
    if (!account) return undefined;
    try {
      return (await account.createJWT()).jwt;
    } catch {
      return undefined;
    }
  },
  async signIn(email, password) {
    if (!account) throw new Error("Appwrite Auth is not configured.");
    await account.createEmailPasswordSession({ email, password });
    const user = await account.get();
    if (!user.emailVerification) {
      try {
        await account.createVerification({
          url: verificationUrl(`${publicOrigin}/login?next=%2Fdashboard`),
        });
      } catch {
        // Keep the verification-required result: the UI can invite the user to retry later.
      } finally {
        await account.deleteSession({ sessionId: "current" });
      }
      const error = new Error("Your email is not verified yet.");
      error.name = "EmailVerificationRequiredError";
      throw error;
    }
  },
  async signUp(email, password, returnUrl) {
    if (!account) throw new Error("Appwrite Auth is not configured.");
    await account.create({
      userId: ID.unique(),
      email,
      password,
      name: email.split("@")[0] ?? email,
    });
    let sessionCreated = false;
    try {
      await account.createEmailPasswordSession({ email, password });
      sessionCreated = true;
      await account.createVerification({ url: verificationUrl(returnUrl) });
    } catch {
      const error = new Error("Could not send a verification email for the new account.");
      error.name = "EmailVerificationDeliveryError";
      throw error;
    } finally {
      if (sessionCreated) await account.deleteSession({ sessionId: "current" });
    }
    return { needsConfirmation: true };
  },
  async completeEmailVerification(params) {
    const userId = params.get("userId");
    const secret = params.get("secret");
    if (!userId && !secret) return;
    if (!account || !userId || !secret) throw new Error("The verification link is incomplete.");
    await account.updateVerification({ userId, secret });
  },
  async requestPasswordReset(email, returnUrl) {
    if (!account) throw new Error("Appwrite Auth is not configured.");
    await account.createRecovery({ email, url: returnUrl });
  },
  async resetPassword(password, params) {
    if (!account) throw new Error("Appwrite Auth is not configured.");
    const userId = params.get("userId");
    const secret = params.get("secret");
    if (!userId || !secret) throw new Error("The reset link is missing its credentials.");
    await account.updateRecovery({ userId, secret, password });
  },
  async changePassword(currentPassword, newPassword) {
    if (!account) throw new Error("Appwrite Auth is not configured.");
    try {
      await account.updatePassword({ password: newPassword, oldPassword: currentPassword });
    } catch (error) {
      if (error instanceof AppwriteException) {
        if (error.type === "user_invalid_credentials") throw new AccountError("invalid-password");
        if (error.code === 429) throw new AccountError("rate-limited");
        if (error.code === 400) throw new AccountError("invalid-input");
      }
      throw error;
    }
    // Sessions on other devices end; this one stays signed in.
    const { sessions } = await account.listSessions();
    await Promise.all(
      sessions
        .filter((session) => !session.current)
        .map((session) => account.deleteSession({ sessionId: session.$id })),
    );
  },
  async signOut() {
    if (account) await account.deleteSession({ sessionId: "current" });
  },
};

export const getAccessToken = () => authClient.getAccessToken();

import { Account, Client, ID } from "appwrite";
import type { AuthClient } from "@/lib/auth-client";

const endpoint = import.meta.env.VITE_APPWRITE_ENDPOINT;
const projectId = import.meta.env.VITE_APPWRITE_PROJECT_ID;
const configured = Boolean(endpoint && projectId);
const account = configured
  ? new Account(new Client().setEndpoint(endpoint).setProject(projectId))
  : undefined;

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
      await account.deleteSession({ sessionId: "current" });
      throw new Error("Confirm your email address before signing in.");
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
    const verificationUrl = new URL(returnUrl);
    verificationUrl.searchParams.set("next", "/dashboard");
    await account.createVerification({ url: verificationUrl.toString() });
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
  async signOut() {
    if (account) await account.deleteSession({ sessionId: "current" });
  },
};

export const getAccessToken = () => authClient.getAccessToken();

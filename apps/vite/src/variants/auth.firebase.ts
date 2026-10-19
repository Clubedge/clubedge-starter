import { getApps, initializeApp } from "firebase/app";
import {
  confirmPasswordReset,
  applyActionCode,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import type { AuthClient } from "@/lib/auth-client";

const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
const configured = Boolean(apiKey && projectId);
const app = configured
  ? (getApps()[0] ??
    initializeApp({
      apiKey,
      projectId,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    }))
  : undefined;
const auth = app ? getAuth(app) : undefined;
if (auth && import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL) {
  connectAuthEmulator(auth, import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL, {
    disableWarnings: true,
  });
}

export const authClient: AuthClient = {
  configured,
  async getAccessToken() {
    if (!auth) return undefined;
    await auth.authStateReady();
    return auth.currentUser?.getIdToken();
  },
  async signIn(email, password) {
    if (!auth) throw new Error("Firebase Auth is not configured.");
    const result = await signInWithEmailAndPassword(auth, email, password);
    if (!result.user.emailVerified) {
      try {
        await sendEmailVerification(result.user);
      } catch {
        // Preserve the verification-required error even when Firebase cannot resend now.
      } finally {
        await signOut(auth);
      }
      const error = new Error("Your email is not verified yet.");
      error.name = "EmailVerificationRequiredError";
      throw error;
    }
  },
  async signUp(email, password, returnUrl) {
    if (!auth) throw new Error("Firebase Auth is not configured.");
    const result = await createUserWithEmailAndPassword(auth, email, password);
    try {
      try {
        await sendEmailVerification(result.user, { url: returnUrl });
      } catch {
        const error = new Error("Could not send a verification email for the new account.");
        error.name = "EmailVerificationDeliveryError";
        throw error;
      }
      return { needsConfirmation: true };
    } finally {
      await signOut(auth);
    }
  },
  async completeEmailVerification(params) {
    if (!auth || params.get("mode") !== "verifyEmail") return;
    const code = params.get("oobCode");
    if (!code) throw new Error("The verification link is missing its code.");
    await applyActionCode(auth, code);
  },
  async requestPasswordReset(email, returnUrl) {
    if (!auth) throw new Error("Firebase Auth is not configured.");
    const continueUrl = new URL("/login?notice=password-reset", returnUrl).toString();
    // Firebase's hosted action handler completes the reset before redirecting to our app.
    await sendPasswordResetEmail(auth, email, { url: continueUrl });
  },
  async resetPassword(password, params) {
    if (!auth) throw new Error("Firebase Auth is not configured.");
    const code = params.get("oobCode");
    if (!code) throw new Error("The reset link is missing its code.");
    await confirmPasswordReset(auth, code, password);
  },
  async signOut() {
    if (auth) await signOut(auth);
  },
};

export const getAccessToken = () => authClient.getAccessToken();

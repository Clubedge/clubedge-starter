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
    return auth?.currentUser?.getIdToken();
  },
  async signIn(email, password) {
    if (!auth) throw new Error("Firebase Auth is not configured.");
    const result = await signInWithEmailAndPassword(auth, email, password);
    if (!result.user.emailVerified) {
      await signOut(auth);
      throw new Error("Confirm your email address before signing in.");
    }
  },
  async signUp(email, password, returnUrl) {
    if (!auth) throw new Error("Firebase Auth is not configured.");
    const result = await createUserWithEmailAndPassword(auth, email, password);
    await sendEmailVerification(result.user, { url: returnUrl });
    await signOut(auth);
    return { needsConfirmation: true };
  },
  async completeEmailVerification(params) {
    if (!auth || params.get("mode") !== "verifyEmail") return;
    const code = params.get("oobCode");
    if (!code) throw new Error("The verification link is missing its code.");
    await applyActionCode(auth, code);
  },
  async requestPasswordReset(email, returnUrl) {
    if (!auth) throw new Error("Firebase Auth is not configured.");
    await sendPasswordResetEmail(auth, email, { url: returnUrl, handleCodeInApp: true });
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

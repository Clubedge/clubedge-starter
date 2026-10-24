import { FirebaseError, getApps, initializeApp } from "firebase/app";
import {
  EmailAuthProvider,
  confirmPasswordReset,
  applyActionCode,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  indexedDBLocalPersistence, // clubedge:only shell!=none
  initializeAuth, // clubedge:only shell!=none
  reauthenticateWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
} from "firebase/auth";
import { AccountError, type AuthClient } from "@/lib/auth-client";

const badCredentials = [
  "auth/wrong-password",
  "auth/invalid-credential",
  "auth/invalid-login-credentials",
];

/** Firebase's refusals the settings page can explain, or the error as it is. */
function accountError(error: unknown): unknown {
  if (!(error instanceof FirebaseError)) return error;
  if (badCredentials.includes(error.code)) return new AccountError("invalid-password");
  if (error.code === "auth/too-many-requests") return new AccountError("rate-limited");
  if (error.code === "auth/weak-password") return new AccountError("invalid-input");
  return error;
}

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
// clubedge:if shell!=none
// In the mobile app, getAuth's default setup loads a frame from Firebase's auth domain for sign-in
// pop-ups, which never finishes loading in an iOS WebView. initializeAuth leaves it out and keeps
// the session in IndexedDB; getAuth below then returns this instance.
if (app && import.meta.env.MODE === "app") {
  initializeAuth(app, { persistence: indexedDBLocalPersistence });
}
// clubedge:end
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
  async changePassword(currentPassword, newPassword) {
    if (!auth) throw new Error("Firebase Auth is not configured.");
    await auth.authStateReady();
    const user = auth.currentUser;
    if (!user?.email) throw new Error("Not signed in.");
    try {
      await reauthenticateWithCredential(
        user,
        EmailAuthProvider.credential(user.email, currentPassword),
      );
      await updatePassword(user, newPassword);
    } catch (error) {
      throw accountError(error);
    }
    // A new password ends the user's other sessions, and the API refuses tokens from sessions
    // older than it. Sign this browser in again once the change's second has passed.
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    await signInWithEmailAndPassword(auth, user.email, newPassword);
  },
  async signOut() {
    if (auth) await signOut(auth);
  },
};

export const getAccessToken = () => authClient.getAccessToken();

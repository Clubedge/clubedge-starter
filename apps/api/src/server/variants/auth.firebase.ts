import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import type { User } from "@clubedge/contract";
import type { AccountDeletionResult, ProviderAccountDeletion } from "@/routes/account";

function firebaseAuth() {
  if (getApps().length) return getAuth();
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) return null;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const app =
    clientEmail && privateKey
      ? initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), projectId })
      : initializeApp({ projectId });
  return getAuth(app);
}

export async function getCurrentUser(
  request: Request,
  _config?: { url: string; publishableKey: string },
): Promise<User | null> {
  void _config;
  const token = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) return null;
  try {
    const auth = firebaseAuth();
    if (!auth) return null;
    const decoded = await auth.verifyIdToken(token, true);
    if (!decoded.email || !decoded.email_verified) return null;
    return { id: decoded.uid, email: decoded.email, displayName: decoded.name ?? null };
  } catch {
    return null;
  }
}

// A wrong password, an unknown address, or a disabled account: one answer for all.
const BAD_CREDENTIALS = new Set([
  "EMAIL_NOT_FOUND",
  "INVALID_PASSWORD",
  "INVALID_LOGIN_CREDENTIALS",
  "USER_DISABLED",
]);

/** Checking a password needs Identity Toolkit's REST API, with the project's Web API key. */
export function canDeleteAccount(): boolean {
  return Boolean(process.env.FIREBASE_API_KEY && process.env.FIREBASE_PROJECT_ID);
}

export async function deleteAccount({
  user,
  password,
  beforeDelete,
}: ProviderAccountDeletion): Promise<AccountDeletionResult> {
  const apiKey = process.env.FIREBASE_API_KEY;
  const auth = firebaseAuth();
  if (!apiKey || !auth) return "not-supported";
  const emulator = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const identity = emulator
    ? `http://${emulator}/identitytoolkit.googleapis.com`
    : "https://identitytoolkit.googleapis.com";
  const response = await fetch(
    `${identity}/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: user.email, password, returnSecureToken: false }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  const body = (await response.json().catch(() => null)) as {
    localId?: string;
    error?: { message?: string };
  } | null;
  if (!response.ok) {
    // Messages look like "INVALID_PASSWORD" or "TOO_MANY_ATTEMPTS_TRY_LATER : ...".
    const code = body?.error?.message?.split(" ")[0] ?? "";
    if (BAD_CREDENTIALS.has(code)) return "invalid-password";
    if (code.startsWith("TOO_MANY_ATTEMPTS")) return "rate-limited";
    throw new Error(`Firebase could not check the password (${response.status} ${code}).`);
  }
  if (body?.localId !== user.id) return "invalid-password";
  await beforeDelete();
  // Its refresh tokens stop working with it, which ends its sessions.
  await auth.deleteUser(user.id);
  return "deleted";
}

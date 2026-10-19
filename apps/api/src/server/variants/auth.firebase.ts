import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import type { User } from "@clubedge/contract";

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

export async function getCurrentUser(request: Request): Promise<User | null> {
  const token = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) return null;
  try {
    const auth = firebaseAuth();
    if (!auth) return null;
    const decoded = await auth.verifyIdToken(token);
    if (!decoded.email || !decoded.email_verified) return null;
    return { id: decoded.uid, email: decoded.email, displayName: decoded.name ?? null };
  } catch {
    return null;
  }
}

import { Account, AppwriteException, Client, Users } from "node-appwrite";
import type { User } from "@clubedge/contract";
import type { AccountDeletionResult, ProviderAccountDeletion } from "@/routes/account";

export async function getCurrentUser(
  request: Request,
  _config?: { url: string; publishableKey: string },
): Promise<User | null> {
  void _config;
  const token = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
  const endpoint = process.env.APPWRITE_ENDPOINT;
  const projectId = process.env.APPWRITE_PROJECT_ID;
  if (!token || !endpoint || !projectId) return null;
  try {
    const response = await fetch(`${endpoint.replace(/\/$/, "")}/account`, {
      headers: { "X-Appwrite-Project": projectId, "X-Appwrite-JWT": token },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const account = (await response.json()) as {
      $id?: unknown;
      email?: unknown;
      name?: unknown;
      emailVerification?: unknown;
    };
    if (
      typeof account.$id !== "string" ||
      typeof account.email !== "string" ||
      account.emailVerification !== true
    )
      return null;
    return {
      id: account.$id,
      email: account.email,
      displayName: typeof account.name === "string" ? account.name : null,
    };
  } catch {
    return null;
  }
}

// A wrong password, an unknown address, or a blocked account: one answer for all.
const BAD_CREDENTIALS = ["user_invalid_credentials", "user_blocked", "user_not_found"];

/** Deleting a user needs an API key with the sessions.write and users.write scopes. */
export function canDeleteAccount(): boolean {
  const env = process.env;
  return Boolean(env.APPWRITE_ENDPOINT && env.APPWRITE_PROJECT_ID && env.APPWRITE_API_KEY);
}

export async function deleteAccount({
  user,
  password,
  beforeDelete,
}: ProviderAccountDeletion): Promise<AccountDeletionResult> {
  const endpoint = process.env.APPWRITE_ENDPOINT;
  const projectId = process.env.APPWRITE_PROJECT_ID;
  const apiKey = process.env.APPWRITE_API_KEY;
  if (!endpoint || !projectId || !apiKey) return "not-supported";
  const admin = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
  // Creating a session checks the password; the session is deleted straight away.
  let session;
  try {
    session = await new Account(admin).createEmailPasswordSession({
      email: user.email,
      password,
    });
  } catch (error) {
    if (error instanceof AppwriteException && BAD_CREDENTIALS.includes(error.type)) {
      return "invalid-password";
    }
    if (error instanceof AppwriteException && error.code === 429) return "rate-limited";
    throw error;
  }
  const users = new Users(admin);
  await users.deleteSession({ userId: session.userId, sessionId: session.$id });
  if (session.userId !== user.id) return "invalid-password";
  await beforeDelete();
  await users.delete({ userId: user.id });
  return "deleted";
}

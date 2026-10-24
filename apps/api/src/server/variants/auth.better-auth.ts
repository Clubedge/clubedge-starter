import { verifyPassword } from "better-auth/crypto";
import type { User } from "@clubedge/contract";
import type { AccountDeletionResult, ProviderAccountDeletion } from "@/routes/account";
import { getDb } from "@/server/db";

export async function getCurrentUser(
  request: Request,
  _config?: { url: string; publishableKey: string },
): Promise<User | null> {
  void _config;
  const authUrl = process.env.BETTER_AUTH_URL;
  // The session's cookie, or its token as a bearer token from a client without the cookie, such
  // as a mobile app, which Better Auth's bearer plugin takes.
  const headers = Object.fromEntries(
    ["cookie", "authorization"].flatMap((name) => {
      const value = request.headers.get(name);
      return value ? [[name, value]] : [];
    }),
  );
  if (!authUrl || Object.keys(headers).length === 0) return null;
  try {
    const response = await fetch(new URL("/api/auth/get-session", authUrl), {
      headers,
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object") return null;
    const user = (payload as { user?: unknown }).user;
    if (!user || typeof user !== "object") return null;
    const record = user as { id?: unknown; email?: unknown; name?: unknown };
    if (typeof record.id !== "string" || typeof record.email !== "string") return null;
    return {
      id: record.id,
      email: record.email,
      displayName: typeof record.name === "string" ? record.name : null,
    };
  } catch {
    return null;
  }
}

// Better Auth runs in the frontend's server, but its tables are in this API's database, so the
// API deletes accounts there, as an admin API would. The frontend's Better Auth server leaves
// its own delete-user endpoint off, so every deletion also removes the app's data.

/** Deleting needs only the shared database, which the API always has. */
export function canDeleteAccount(): boolean {
  return true;
}

export async function deleteAccount({
  user,
  password,
  beforeDelete,
}: ProviderAccountDeletion): Promise<AccountDeletionResult> {
  const sql = getDb().$client;
  const [credential] = await sql<Array<{ password: string | null }>>`
    select password from auth_account
    where user_id = ${user.id} and provider_id = 'credential'
    limit 1
  `;
  if (!credential?.password || !(await verifyPassword({ hash: credential.password, password }))) {
    return "invalid-password";
  }
  await beforeDelete();
  // Its sessions and accounts go with it (on delete cascade), which signs it out everywhere.
  await sql`delete from auth_user where id = ${user.id}`;
  return "deleted";
}

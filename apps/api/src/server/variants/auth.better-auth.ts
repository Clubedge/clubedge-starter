import { verifyPassword } from "better-auth/crypto";
import {
  createBetterAuthServer,
  drizzleDatabase,
  type BetterAuthServer,
} from "@clubedge/auth-better-auth";
import type { User } from "@clubedge/contract";
import { siteConfig } from "@/config/site";
import type { AccountDeletionResult, ProviderAccountDeletion } from "@/routes/account";
import { getDb } from "@/server/db";
import { email } from "@/server/email"; // clubedge:only email!=none

// Better Auth runs in the website's server, which this API asks for each request's session. In a
// project without a website, it runs in this API instead, once BETTER_AUTH_SECRET is set here:
// the mobile app signs in at /api/auth, and emailed links open Better Auth's endpoints here,
// which then open the app.

/** The mobile app's address scheme, made from the site config as its app.config.ts makes it. */
const appScheme =
  siteConfig.serviceId
    .toLowerCase()
    .replace(/[^a-z0-9+.-]/g, "")
    .replace(/^[^a-z]+/, "") || "app";

let server: BetterAuthServer | undefined;

/** Better Auth in this API, or null when it runs in the website's server instead. */
function betterAuthServer(): BetterAuthServer | null {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) return null;
  server ??= createBetterAuthServer({
    database: drizzleDatabase(getDb()),
    secret,
    baseUrl: process.env.BETTER_AUTH_URL ?? "http://localhost:3001",
    sendEmail: (message) => email.send(message), // clubedge:only email!=none
    requireEmailVerification: process.env.BETTER_AUTH_REQUIRE_EMAIL_VERIFICATION === "true", // clubedge:only email!=none
    appName: siteConfig.name,
    emailLinks: "endpoints",
    // The app's requests and its links' addresses use its scheme.
    trustedOrigins: [`${appScheme}://`],
    // The API deletes accounts (POST /api/account/delete), removing the app's data with them.
    deleteUser: false,
  });
  return server;
}

/** Better Auth's endpoints, at /api/auth, when it runs in this API. */
export async function handleAuthRequest(request: Request): Promise<Response> {
  const auth = betterAuthServer();
  if (!auth) {
    return Response.json({ error: "Better Auth requires BETTER_AUTH_SECRET." }, { status: 503 });
  }
  return auth.handler(request);
}

export async function getCurrentUser(
  request: Request,
  _config?: { url: string; publishableKey: string },
): Promise<User | null> {
  void _config;
  const auth = betterAuthServer();
  if (auth) {
    const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
    if (!session) return null;
    const { id, email, name } = session.user;
    return { id, email, displayName: name || null };
  }
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

// Better Auth's tables are in this API's database, so the API deletes accounts there, as an admin
// API would, wherever Better Auth runs. Better Auth's own delete-user endpoint stays off, so every
// deletion also removes the app's data.

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

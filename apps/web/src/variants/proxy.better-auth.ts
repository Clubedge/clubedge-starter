import { NextResponse, type NextRequest } from "next/server";
import type { CookieStore } from "@clubedge/auth";
import {
  createBetterAuth,
  createBetterAuthServer,
  drizzleDatabase,
  type BetterAuthServer,
} from "@clubedge/auth-better-auth";
import { createDb } from "@clubedge/db";
import { getBetterAuthEnv } from "@/env/auth";
import { getServerEnv } from "@/env/server";
import { reportError } from "@clubedge/core";

// The proxy cannot import server-only modules, so it keeps its own Better Auth server.
let server: BetterAuthServer | undefined;

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const env = getBetterAuthEnv();
  if (!env) return response;

  // Refreshed cookies must reach both the downstream request and the browser response.
  const cookies: CookieStore = {
    getAll: () => request.cookies.getAll(),
    setAll(values) {
      values.forEach(({ name, value }) => request.cookies.set(name, value));
      response = NextResponse.next({ request });
      values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
    },
  };

  try {
    server ??= createBetterAuthServer({
      database: drizzleDatabase(createDb({ url: getServerEnv().DATABASE_URL })),
      ...env,
    });
    await createBetterAuth({ server, cookies }).refreshSession();
  } catch (error) {
    // Pages still render; protected pages check the session again and redirect when needed.
    reportError(error, { message: "Session refresh failed" });
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};

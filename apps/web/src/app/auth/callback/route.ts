import { NextResponse, type NextRequest } from "next/server";
import { safeRedirectPath } from "@clubedge/core";
import { loginUrl } from "@/lib/login-url";
import { getAuth } from "@/server/auth";
import { ensureUserProfile } from "@/server/users";

/**
 * Redirects to a path on the same host the browser used. An absolute URL built from request.url
 * can name another host (the development server reports localhost when visited as 127.0.0.1),
 * and the session cookies this route sets would not reach it.
 */
function redirectTo(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeRedirectPath(request.nextUrl.searchParams.get("next"));

  if (code) {
    const auth = await getAuth();
    const result = await auth.exchangeCodeForSession(code);
    if (result.ok) {
      await ensureUserProfile(result.value);
      return redirectTo(next);
    }
  }

  return redirectTo(loginUrl({ error: "auth-callback" }));
}

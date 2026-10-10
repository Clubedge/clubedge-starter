import { NextResponse, type NextRequest } from "next/server";
import { safeRedirectPath } from "@clubedge/core";
import { loginUrl } from "@/lib/login-url";
import { getAuth } from "@/server/auth";
import { ensureUserProfile } from "@/server/users";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeRedirectPath(request.nextUrl.searchParams.get("next"));

  if (code) {
    const auth = await getAuth();
    const result = await auth.exchangeCodeForSession(code);
    if (result.ok) {
      await ensureUserProfile(result.value);
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  return NextResponse.redirect(new URL(loginUrl({ error: "auth-callback" }), request.url));
}

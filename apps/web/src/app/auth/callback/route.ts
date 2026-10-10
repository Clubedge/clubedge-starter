import { NextResponse, type NextRequest } from "next/server";
import { loginUrl, safeRedirectPath } from "@/lib/auth/redirect";
import { createSupabaseServerClient } from "@/lib/auth/supabase";
import { ensureUserProfile } from "@/lib/users/profile";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeRedirectPath(request.nextUrl.searchParams.get("next"));

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (data.user) await ensureUserProfile({ id: data.user.id, email: data.user.email ?? null });
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  return NextResponse.redirect(new URL(loginUrl({ error: "auth-callback" }), request.url));
}

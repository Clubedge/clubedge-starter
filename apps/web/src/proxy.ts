import { NextResponse, type NextRequest } from "next/server";
import type { CookieStore } from "@clubedge/auth";
import { createSupabaseAuth } from "@clubedge/auth/supabase";
import { clientEnv, hasSupabaseAuthConfig } from "@/env/client";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (!hasSupabaseAuthConfig) return response;

  // Refreshed cookies must reach both the downstream request and the browser response.
  const cookies: CookieStore = {
    getAll: () => request.cookies.getAll(),
    setAll(values) {
      values.forEach(({ name, value }) => request.cookies.set(name, value));
      response = NextResponse.next({ request });
      values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
    },
  };

  const auth = createSupabaseAuth({
    url: clientEnv.NEXT_PUBLIC_SUPABASE_URL!,
    publishableKey: clientEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    cookies,
  });
  await auth.refreshSession();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};

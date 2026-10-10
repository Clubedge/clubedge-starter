import { NextResponse, type NextRequest } from "next/server";
import type { CookieStore } from "@clubedge/auth";
import { createSupabaseAuth } from "@clubedge/auth-supabase";
import { getSupabaseAuthEnv } from "@/env/auth";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const env = getSupabaseAuthEnv();
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

  const auth = createSupabaseAuth({ ...env, cookies });
  await auth.refreshSession();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};

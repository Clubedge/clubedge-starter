import "server-only";
import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import { cookies } from "next/headers";
import { clientEnv, hasSupabaseAuthConfig } from "@/env/client";
import type { AuthProvider, AuthUser } from "./types";

export async function createSupabaseServerClient() {
  if (!hasSupabaseAuthConfig) throw new Error("Supabase Auth is not configured.");
  const cookieStore = await cookies();
  return createServerClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL!,
    clientEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: ((values) => {
          try {
            values.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Server Components cannot write cookies. The proxy refreshes sessions instead.
          }
        }) satisfies NonNullable<CookieMethodsServer["setAll"]>,
      },
    },
  );
}

export const supabaseAuthProvider: AuthProvider = {
  async getUser(): Promise<AuthUser | null> {
    if (!hasSupabaseAuthConfig) return null;
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return { id: data.user.id, email: data.user.email ?? null };
  },
  async signOut() {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },
};

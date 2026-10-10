"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { clientEnv } from "@/env/client";
import { loginUrl, safeRedirectPath } from "@/lib/auth/redirect";
import { createSupabaseServerClient } from "@/lib/auth/supabase";
import { createRateLimiter } from "@/lib/cache";
import { getClientIp } from "@/lib/http/client-ip";
import { ensureUserProfile } from "@/lib/users/profile";

const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(128),
});

// Ten attempts per minute per client address and action.
const authRateLimiter = createRateLimiter(10, 60);

function readCredentials(formData: FormData) {
  return credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
}

async function isRateLimited(action: "sign-in" | "sign-up") {
  const ip = getClientIp(await headers());
  try {
    const result = await authRateLimiter.limit(`auth:${action}:${ip}`);
    return !result.success;
  } catch (error) {
    // Fail open: an unavailable limiter backend should not lock every user out.
    console.error("Rate limiter unavailable", error);
    return false;
  }
}

export async function signIn(formData: FormData) {
  const next = safeRedirectPath(formData.get("next"));
  if (await isRateLimited("sign-in")) redirect(loginUrl({ error: "rate-limited", next }));

  const parsed = readCredentials(formData);
  if (!parsed.success) redirect(loginUrl({ error: "invalid-input", next }));

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) redirect(loginUrl({ error: "invalid-credentials", next }));

  await ensureUserProfile({ id: data.user.id, email: data.user.email ?? null });
  redirect(next);
}

export async function signUp(formData: FormData) {
  const next = safeRedirectPath(formData.get("next"));
  if (await isRateLimited("sign-up")) {
    redirect(loginUrl({ mode: "signup", error: "rate-limited", next }));
  }

  const parsed = readCredentials(formData);
  if (!parsed.success) redirect(loginUrl({ mode: "signup", error: "invalid-input", next }));

  const supabase = await createSupabaseServerClient();
  const callbackUrl = new URL("/auth/callback", clientEnv.NEXT_PUBLIC_APP_URL);
  callbackUrl.searchParams.set("next", next);
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: callbackUrl.toString() },
  });
  if (error) redirect(loginUrl({ mode: "signup", error: "signup-failed", next }));
  if (!data.session || !data.user) redirect(loginUrl({ mode: "signup", checkEmail: true, next }));

  await ensureUserProfile({ id: data.user.id, email: data.user.email ?? null });
  redirect(next);
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

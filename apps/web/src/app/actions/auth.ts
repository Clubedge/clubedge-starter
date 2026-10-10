"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getClientIp, safeRedirectPath } from "@clubedge/core";
import { clientEnv } from "@/env/client";
import { loginUrl } from "@/lib/login-url";
import { getAuth } from "@/server/auth";
import { createRateLimiter } from "@/server/cache";
import { ensureUserProfile } from "@/server/users";

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

  const auth = await getAuth();
  const result = await auth.signInWithPassword(parsed.data);
  if (!result.ok) redirect(loginUrl({ error: "invalid-credentials", next }));

  await ensureUserProfile(result.value);
  redirect(next);
}

export async function signUp(formData: FormData) {
  const next = safeRedirectPath(formData.get("next"));
  if (await isRateLimited("sign-up")) {
    redirect(loginUrl({ mode: "signup", error: "rate-limited", next }));
  }

  const parsed = readCredentials(formData);
  if (!parsed.success) redirect(loginUrl({ mode: "signup", error: "invalid-input", next }));

  const callbackUrl = new URL("/auth/callback", clientEnv.NEXT_PUBLIC_APP_URL);
  callbackUrl.searchParams.set("next", next);
  const auth = await getAuth();
  const result = await auth.signUp({ ...parsed.data, emailRedirectTo: callbackUrl.toString() });
  if (!result.ok) redirect(loginUrl({ mode: "signup", error: "signup-failed", next }));
  if (result.value.needsConfirmation || !result.value.user) {
    redirect(loginUrl({ mode: "signup", checkEmail: true, next }));
  }

  await ensureUserProfile(result.value.user);
  redirect(next);
}

export async function signOut() {
  try {
    const auth = await getAuth();
    await auth.signOut();
  } catch (error) {
    console.error("Sign-out failed", error);
  }
  redirect("/login");
}

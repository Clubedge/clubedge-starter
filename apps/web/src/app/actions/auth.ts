"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getClientIp, safeRedirectPath, reportError } from "@clubedge/core";
import { clientEnv } from "@/env/client";
import { getClientIpSettings } from "@/env/server";
import { loginUrl } from "@/lib/login-url";
import { getAuth } from "@/server/auth";
import { createRateLimiter } from "@/server/cache";
import { ensureUserProfile } from "@/server/users";

const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(128),
});

const emailSchema = z.object({ email: z.email() });

const newPasswordSchema = z.object({
  password: z.string().min(8).max(128),
  // Better Auth's reset links carry a token; Supabase's create a session instead.
  token: z.string().min(1).optional(),
});

// Ten attempts per minute per client address and action.
const authRateLimiter = createRateLimiter(10, 60);

function readCredentials(formData: FormData) {
  return credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
}

async function isRateLimited(action: "sign-in" | "sign-up" | "password-reset") {
  // Next.js gives server actions no connection address: without CLIENT_IP_HEADER or
  // TRUSTED_PROXY_HOPS, every client shares one count (SETUP.md, "Client addresses").
  const ip = getClientIp(await headers(), getClientIpSettings());
  try {
    const result = await authRateLimiter.limit(`auth:${action}:${ip}`);
    return !result.success;
  } catch (error) {
    // Fail open: an unavailable limiter backend should not lock every user out.
    reportError(error, { message: "Rate limiter unavailable" });
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
  if (!result.ok) redirect(loginUrl({ error: result.error, next }));

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

export async function requestPasswordReset(formData: FormData) {
  if (await isRateLimited("password-reset")) redirect("/forgot-password?error=rate-limited");
  const parsed = emailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) redirect("/forgot-password?error=invalid-input");

  const auth = await getAuth();
  if (!auth.canResetPassword) redirect("/login");
  // Supabase's link signs the user in through the callback, then opens the reset page.
  const callbackUrl = new URL("/auth/callback", clientEnv.NEXT_PUBLIC_APP_URL);
  callbackUrl.searchParams.set("next", "/reset-password");
  await auth.requestPasswordReset({ email: parsed.data.email, redirectTo: callbackUrl.toString() });
  // The same answer whether or not the address has an account.
  redirect(loginUrl({ notice: "reset-sent" }));
}

export async function resetPassword(formData: FormData) {
  const token = formData.get("token") || undefined;
  if (await isRateLimited("password-reset")) redirect(resetPasswordUrl(token, "rate-limited"));
  const parsed = newPasswordSchema.safeParse({ password: formData.get("password"), token });
  if (!parsed.success) redirect(resetPasswordUrl(token, "invalid-input"));

  const auth = await getAuth();
  const result = await auth.resetPassword(parsed.data);
  if (!result.ok) redirect(resetPasswordUrl(undefined, "invalid-reset"));
  try {
    // A Supabase reset link signed the user in; sign out so the new password is used next.
    await auth.signOut();
  } catch (error) {
    reportError(error, { message: "Sign-out after password reset failed" });
  }
  redirect(loginUrl({ notice: "password-updated" }));
}

function resetPasswordUrl(token: FormDataEntryValue | undefined, error: string) {
  const params = new URLSearchParams({ error });
  if (typeof token === "string") params.set("token", token);
  return `/reset-password?${params}`;
}

export async function signOut() {
  try {
    const auth = await getAuth();
    await auth.signOut();
  } catch (error) {
    reportError(error, { message: "Sign-out failed" });
  }
  redirect("/login");
}

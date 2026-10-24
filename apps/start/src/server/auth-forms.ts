import "@tanstack/react-start/server-only";
import { linkToken } from "@clubedge/auth";
import { z } from "zod";
import { safeRedirectPath, reportError } from "@clubedge/core";
import { getAppUrl } from "@/env/server";
import { loginUrl } from "@/lib/login-url";
import { getAuth, isAuthConfigured } from "./auth";
import { createRateLimiter } from "./cache";
import { clientIp } from "./client-ip";
import { ensureUserProfile } from "./users";

// Form endpoints for the login page. They answer with 303 redirects, so the forms work with
// or without JavaScript, the same way the Next.js server actions do.

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

function seeOther(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location } });
}

/** The form endpoints have no page of their own; send direct visits to the login page. */
export function handleFormEndpointVisit(): Response {
  return seeOther("/login");
}

function readCredentials(formData: FormData) {
  return credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
}

async function isRateLimited(request: Request, action: "sign-in" | "sign-up" | "password-reset") {
  const ip = clientIp(request);
  try {
    const result = await authRateLimiter.limit(`auth:${action}:${ip}`);
    return !result.success;
  } catch (error) {
    // Fail open: an unavailable limiter backend should not lock every user out.
    reportError(error, { message: "Rate limiter unavailable" });
    return false;
  }
}

export async function handleSignIn(request: Request): Promise<Response> {
  const formData = await request.formData();
  const next = safeRedirectPath(formData.get("next"));
  // The login page explains the missing configuration; never answer a form post with a 500.
  if (!isAuthConfigured()) return seeOther(loginUrl({ next }));
  if (await isRateLimited(request, "sign-in")) {
    return seeOther(loginUrl({ error: "rate-limited", next }));
  }

  const parsed = readCredentials(formData);
  if (!parsed.success) return seeOther(loginUrl({ error: "invalid-input", next }));

  const result = await getAuth().signInWithPassword(parsed.data);
  if (!result.ok) return seeOther(loginUrl({ error: result.error, next }));

  await ensureUserProfile(result.value);
  return seeOther(next);
}

export async function handleSignUp(request: Request): Promise<Response> {
  const formData = await request.formData();
  const next = safeRedirectPath(formData.get("next"));
  if (!isAuthConfigured()) return seeOther(loginUrl({ mode: "signup", next }));
  if (await isRateLimited(request, "sign-up")) {
    return seeOther(loginUrl({ mode: "signup", error: "rate-limited", next }));
  }

  const parsed = readCredentials(formData);
  if (!parsed.success) return seeOther(loginUrl({ mode: "signup", error: "invalid-input", next }));

  const callbackUrl = new URL("/auth/callback", getAppUrl());
  callbackUrl.searchParams.set("next", next);
  const result = await getAuth().signUp({
    ...parsed.data,
    emailRedirectTo: callbackUrl.toString(),
  });
  if (!result.ok) return seeOther(loginUrl({ mode: "signup", error: "signup-failed", next }));
  if (result.value.needsConfirmation || !result.value.user) {
    return seeOther(loginUrl({ mode: "signup", checkEmail: true, next }));
  }

  await ensureUserProfile(result.value.user);
  return seeOther(next);
}

export async function handleForgotPassword(request: Request): Promise<Response> {
  const formData = await request.formData();
  if (!isAuthConfigured() || !getAuth().canResetPassword) return seeOther("/login");
  if (await isRateLimited(request, "password-reset")) {
    return seeOther("/forgot-password?error=rate-limited");
  }
  const parsed = emailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return seeOther("/forgot-password?error=invalid-input");

  // Supabase's link signs the user in through the callback, then opens the reset page.
  const callbackUrl = new URL("/auth/callback", getAppUrl());
  callbackUrl.searchParams.set("next", "/reset-password");
  await getAuth().requestPasswordReset({
    email: parsed.data.email,
    redirectTo: callbackUrl.toString(),
  });
  // The same answer whether or not the address has an account.
  return seeOther(loginUrl({ notice: "reset-sent" }));
}

function resetPasswordUrl(token: FormDataEntryValue | undefined, error: string) {
  const params = new URLSearchParams({ error });
  if (typeof token === "string") params.set("token", token);
  return `/reset-password?${params}`;
}

export async function handleResetPassword(request: Request): Promise<Response> {
  const formData = await request.formData();
  if (!isAuthConfigured()) return seeOther("/login");
  const token = formData.get("token") || undefined;
  if (await isRateLimited(request, "password-reset")) {
    return seeOther(resetPasswordUrl(token, "rate-limited"));
  }
  const parsed = newPasswordSchema.safeParse({ password: formData.get("password"), token });
  if (!parsed.success) return seeOther(resetPasswordUrl(token, "invalid-input"));

  const auth = getAuth();
  const result = await auth.resetPassword(parsed.data);
  if (!result.ok) return seeOther(resetPasswordUrl(undefined, "invalid-reset"));
  try {
    // A Supabase reset link signed the user in; sign out so the new password is used next.
    await auth.signOut();
  } catch (error) {
    reportError(error, { message: "Sign-out after password reset failed" });
  }
  return seeOther(loginUrl({ notice: "password-updated" }));
}

export async function handleSignOut(): Promise<Response> {
  if (!isAuthConfigured()) return seeOther("/login");
  try {
    await getAuth().signOut();
  } catch (error) {
    reportError(error, { message: "Sign-out failed" });
  }
  return seeOther("/login");
}

export async function handleAuthCallback(request: Request): Promise<Response> {
  const url = new URL(request.url);
  // Appwrite's links carry userId and secret instead of a code.
  const code = linkToken(url.searchParams, "code");
  const next = safeRedirectPath(url.searchParams.get("next"));

  if (code && isAuthConfigured()) {
    const result = await getAuth().exchangeCodeForSession(code);
    if (result.ok) {
      await ensureUserProfile(result.value);
      return seeOther(next);
    }
  }

  return seeOther(loginUrl({ error: "auth-callback" }));
}

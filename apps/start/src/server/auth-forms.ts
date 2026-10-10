import "@tanstack/react-start/server-only";
import { z } from "zod";
import { getClientIp, safeRedirectPath } from "@clubedge/core";
import { getAppUrl } from "@/env/server";
import { loginUrl } from "@/lib/login-url";
import { getAuth, isAuthConfigured } from "./auth";
import { createRateLimiter } from "./cache";
import { ensureUserProfile } from "./users";

// Form endpoints for the login page. They answer with 303 redirects, so the forms work with
// or without JavaScript, the same way the Next.js server actions do.

const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(128),
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

async function isRateLimited(request: Request, action: "sign-in" | "sign-up") {
  const ip = getClientIp(request.headers);
  try {
    const result = await authRateLimiter.limit(`auth:${action}:${ip}`);
    return !result.success;
  } catch (error) {
    // Fail open: an unavailable limiter backend should not lock every user out.
    console.error("Rate limiter unavailable", error);
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
  if (!result.ok) return seeOther(loginUrl({ error: "invalid-credentials", next }));

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

export async function handleSignOut(): Promise<Response> {
  if (!isAuthConfigured()) return seeOther("/login");
  try {
    await getAuth().signOut();
  } catch (error) {
    console.error("Sign-out failed", error);
  }
  return seeOther("/login");
}

export async function handleAuthCallback(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
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

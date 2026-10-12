import "@tanstack/react-start/server-only";
import { z } from "zod";
import { reportError } from "@clubedge/core";
import { deleteUserProfile, setDisplayName } from "@clubedge/db";
import { loginUrl } from "@/lib/login-url";
import { getAuth, getCurrentUser, isAuthConfigured } from "./auth";
import { createRateLimiter } from "./cache";
import { getDb } from "./db";
// clubedge:if payments!=none
import { getBilling, isEntitled, isPaymentsConfigured } from "./payments";
// clubedge:end
import { getUserProfileId } from "./users";

// Form endpoints for the settings page. They answer with 303 redirects, the same way the
// Next.js server actions do.

// Password checks are rate-limited per user, so a stolen session cannot guess the password.
const settingsRateLimiter = createRateLimiter(10, 60);

function seeOther(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location } });
}

const toSettings = (result: { status?: string; error?: string }) =>
  seeOther(`/settings?${new URLSearchParams(result)}`);

const toLogin = () => seeOther(loginUrl({ next: "/settings" }));

async function signedInUser() {
  const user = isAuthConfigured() ? await getCurrentUser() : null;
  return user?.email ? { ...user, email: user.email } : null;
}

async function isRateLimited(userId: string) {
  try {
    return !(await settingsRateLimiter.limit(`settings:${userId}`)).success;
  } catch (error) {
    // Fail open: an unavailable limiter backend should not lock users out of their settings.
    reportError(error, { message: "Rate limiter unavailable" });
    return false;
  }
}

const profileSchema = z.object({ displayName: z.string().trim().max(80) });

export async function handleUpdateProfile(request: Request): Promise<Response> {
  const user = await signedInUser();
  if (!user) return toLogin();
  const formData = await request.formData();
  const parsed = profileSchema.safeParse({ displayName: formData.get("displayName") ?? "" });
  if (!parsed.success) return toSettings({ error: "invalid-input" });
  await setDisplayName(getDb(), await getUserProfileId(user), parsed.data.displayName || null);
  return toSettings({ status: "profile-saved" });
}

const passwordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
});

export async function handleChangePassword(request: Request): Promise<Response> {
  const user = await signedInUser();
  if (!user) return toLogin();
  if (await isRateLimited(user.id)) return toSettings({ error: "rate-limited" });
  const formData = await request.formData();
  const parsed = passwordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
  });
  if (!parsed.success) return toSettings({ error: "invalid-input" });

  const result = await getAuth().changePassword(parsed.data);
  if (!result.ok && result.error === "not-signed-in") return toLogin();
  if (!result.ok) return toSettings({ error: result.error });
  return toSettings({ status: "password-changed" });
}

const deleteSchema = z.object({ password: z.string().min(1).max(128) });

export async function handleDeleteAccount(request: Request): Promise<Response> {
  const user = await signedInUser();
  if (!user) return toLogin();
  if (await isRateLimited(user.id)) return toSettings({ error: "rate-limited" });
  const formData = await request.formData();
  const parsed = deleteSchema.safeParse({ password: formData.get("password") });
  if (!parsed.success) return toSettings({ error: "invalid-input" });

  // clubedge:if payments!=none
  // A deleted account cannot manage its billing, so an active subscription is cancelled first.
  if (isPaymentsConfigured()) {
    const subscription = await getBilling().subscriptionFor(await getUserProfileId(user));
    if (isEntitled(subscription)) return toSettings({ error: "active-subscription" });
  }
  // clubedge:end
  const result = await getAuth().deleteAccount(parsed.data);
  if (!result.ok && result.error === "not-signed-in") return toLogin();
  if (!result.ok) {
    return toSettings({
      error: result.error === "not-supported" ? "delete-unavailable" : result.error,
    });
  }
  try {
    // The account is gone either way; a profile left behind is reported, not shown to the user.
    await deleteUserProfile(getDb(), user.id);
  } catch (error) {
    reportError(error, { message: "Could not delete the user profile" });
  }
  return seeOther(loginUrl({ notice: "account-deleted" }));
}

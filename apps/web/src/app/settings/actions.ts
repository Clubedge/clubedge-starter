"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { reportError } from "@clubedge/core";
import { deleteUserProfile, setDisplayName } from "@clubedge/db";
import { loginUrl } from "@/lib/login-url";
import { getAuth, getCurrentUser } from "@/server/auth";
import { createRateLimiter } from "@/server/cache";
import { getDb } from "@/server/db";
// clubedge:if payments!=none
import { findSubscription, isEntitled } from "@/server/payments";
// clubedge:end
import { getUserProfileId } from "@/server/users";

// Password checks are rate-limited per user, so a stolen session cannot guess the password.
const settingsRateLimiter = createRateLimiter(10, 60);

const settingsUrl = (result: { status?: string; error?: string }) =>
  `/settings?${new URLSearchParams(result)}`;

async function signedInUser() {
  const user = await getCurrentUser();
  if (!user?.email) redirect(loginUrl({ next: "/settings" }));
  return { ...user, email: user.email };
}

/** Why a password check cannot run now, or null when it can. */
async function passwordCheckBlocked(userId: string) {
  try {
    const { success } = await settingsRateLimiter.limit(`settings:${userId}`);
    return success ? null : "rate-limited";
  } catch (error) {
    // Fail closed: without a working limit, password guesses would be unlimited.
    reportError(error, { message: "Rate limiter unavailable" });
    return "unavailable";
  }
}

const profileSchema = z.object({ displayName: z.string().trim().max(80) });

export async function updateProfile(formData: FormData) {
  const user = await signedInUser();
  const parsed = profileSchema.safeParse({ displayName: formData.get("displayName") ?? "" });
  if (!parsed.success) redirect(settingsUrl({ error: "invalid-input" }));
  await setDisplayName(getDb(), await getUserProfileId(user), parsed.data.displayName || null);
  redirect(settingsUrl({ status: "profile-saved" }));
}

const passwordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
});

export async function changePassword(formData: FormData) {
  const user = await signedInUser();
  const blocked = await passwordCheckBlocked(user.id);
  if (blocked) redirect(settingsUrl({ error: blocked }));
  const parsed = passwordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
  });
  if (!parsed.success) redirect(settingsUrl({ error: "invalid-input" }));

  const result = await (await getAuth()).changePassword(parsed.data);
  if (!result.ok && result.error === "not-signed-in") redirect(loginUrl({ next: "/settings" }));
  if (!result.ok) redirect(settingsUrl({ error: result.error }));
  redirect(settingsUrl({ status: "password-changed" }));
}

const deleteSchema = z.object({ password: z.string().min(1).max(128) });

export async function deleteAccount(formData: FormData) {
  const user = await signedInUser();
  const blocked = await passwordCheckBlocked(user.id);
  if (blocked) redirect(settingsUrl({ error: blocked }));
  const parsed = deleteSchema.safeParse({ password: formData.get("password") });
  if (!parsed.success) redirect(settingsUrl({ error: "invalid-input" }));

  // clubedge:if payments!=none
  // A deleted account cannot manage its billing, so an active subscription is cancelled first.
  // The subscription is read from the database, so this holds even without the Stripe keys.
  const subscription = await findSubscription(getDb(), await getUserProfileId(user));
  if (isEntitled(subscription)) redirect(settingsUrl({ error: "active-subscription" }));
  // clubedge:end
  const result = await (
    await getAuth()
  ).deleteAccount({
    ...parsed.data,
    // Runs once the password is confirmed: if the profile cannot be removed, nothing is deleted.
    beforeDelete: () => deleteUserProfile(getDb(), user.id),
  });
  if (!result.ok && result.error === "not-signed-in") redirect(loginUrl({ next: "/settings" }));
  if (!result.ok) {
    redirect(
      settingsUrl({
        error: result.error === "not-supported" ? "delete-unavailable" : result.error,
      }),
    );
  }
  redirect(loginUrl({ notice: "account-deleted" }));
}

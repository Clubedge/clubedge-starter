"use server";

import { redirect } from "next/navigation";
import { clientEnv } from "@/env/client";
import { plans } from "@/config/plans";
import { loginUrl } from "@/lib/login-url";
import { getCurrentUser } from "@/server/auth";
import { getBilling, NoBillingAccountError } from "@/server/payments";
import { getUserProfileId } from "@/server/users";

const appUrl = (path: string) => new URL(path, clientEnv.NEXT_PUBLIC_APP_URL).toString();

async function signedInProfile() {
  const user = await getCurrentUser();
  if (!user?.email) redirect(loginUrl({ next: "/dashboard" }));
  return { id: await getUserProfileId({ ...user, email: user.email }), email: user.email };
}

/** Starts the provider's hosted checkout for the chosen plan. */
export async function startCheckout(formData: FormData) {
  const plan = plans.find((candidate) => candidate.id === formData.get("planId"));
  if (!plan) redirect("/dashboard");
  const user = await signedInProfile();
  const { url } = await getBilling().checkout({
    user,
    planId: plan.id,
    successUrl: appUrl("/dashboard?billing=success"),
    cancelUrl: appUrl("/dashboard"),
  });
  redirect(url);
}

/** Opens the provider's billing management for the signed-in user. */
export async function openBillingPortal() {
  const user = await signedInProfile();
  let url: string;
  try {
    ({ url } = await getBilling().portal({ userId: user.id, returnUrl: appUrl("/dashboard") }));
  } catch (error) {
    if (error instanceof NoBillingAccountError) redirect("/dashboard");
    throw error;
  }
  redirect(url);
}

import "@tanstack/react-start/server-only";
import { plans } from "@/config/plans";
import { getAppUrl } from "@/env/server";
import { loginUrl } from "@/lib/login-url";
import { getCurrentUser, isAuthConfigured } from "./auth";
import { getBilling, isPaymentsConfigured, NoBillingAccountError } from "./payments";
import { getUserProfileId } from "./users";

// Form endpoints for the billing card. They answer with 303 redirects to the provider's hosted
// pages, the same way the Next.js server actions do.

function seeOther(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location } });
}

const appUrl = (path: string) => new URL(path, getAppUrl()).toString();

async function signedInProfile() {
  const user = isAuthConfigured() ? await getCurrentUser() : null;
  if (!user?.email) return null;
  return { id: await getUserProfileId({ ...user, email: user.email }), email: user.email };
}

export async function handleCheckout(request: Request): Promise<Response> {
  const formData = await request.formData();
  const plan = plans.find((candidate) => candidate.id === formData.get("planId"));
  if (!plan || !isPaymentsConfigured()) return seeOther("/dashboard");
  const user = await signedInProfile();
  if (!user) return seeOther(loginUrl({ next: "/dashboard" }));
  const { url } = await getBilling().checkout({
    user,
    planId: plan.id,
    successUrl: appUrl("/dashboard?billing=success"),
    cancelUrl: appUrl("/dashboard"),
  });
  return seeOther(url);
}

export async function handlePortal(): Promise<Response> {
  if (!isPaymentsConfigured()) return seeOther("/dashboard");
  const user = await signedInProfile();
  if (!user) return seeOther(loginUrl({ next: "/dashboard" }));
  try {
    const { url } = await getBilling().portal({ userId: user.id, returnUrl: appUrl("/dashboard") });
    return seeOther(url);
  } catch (error) {
    if (error instanceof NoBillingAccountError) return seeOther("/dashboard");
    throw error;
  }
}

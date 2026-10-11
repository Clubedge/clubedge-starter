import { createServerFn } from "@tanstack/react-start";
import { planName } from "@/config/plans";
import { getCurrentUser, isAuthConfigured } from "./auth";
import { getBilling, isEntitled, isPaymentsConfigured } from "./payments";
import { getUserProfileId } from "./users";

/** What the dashboard's billing card shows; serializable, so it can cross to the browser. */
export const getBillingStatus = createServerFn({ method: "GET" }).handler(async () => {
  const configured = isPaymentsConfigured();
  const user = isAuthConfigured() ? await getCurrentUser() : null;
  if (!configured || !user?.email)
    return { configured, signedIn: Boolean(user), subscription: null };
  const subscription = await getBilling().subscriptionFor(
    await getUserProfileId({ ...user, email: user.email }),
  );
  return {
    configured,
    signedIn: true,
    subscription: subscription && {
      planName: planName(subscription.planId),
      status: subscription.status,
      entitled: isEntitled(subscription),
      currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    },
  };
});

export type BillingStatus = Awaited<ReturnType<typeof getBillingStatus>>;

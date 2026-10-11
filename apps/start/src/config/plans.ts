/**
 * The plans users can subscribe to. Ids are the app's own: each payment provider maps them to
 * its prices through environment variables, such as STRIPE_PRICE_PRO for the "pro" plan.
 */
export const plans = [
  {
    id: "pro",
    name: "Pro",
    description: "Everything in the free plan, plus the paid features you build.",
  },
] as const;

export type PlanId = (typeof plans)[number]["id"];

export const planName = (id: string | null) =>
  plans.find((plan) => plan.id === id)?.name ?? "Unknown plan";

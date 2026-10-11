import { CreditCard } from "lucide-react";

import { plans } from "@/config/plans";
import type { BillingStatus } from "@/server/billing.functions";
import { Badge } from "@clubedge/ui/components/badge";
import { Button } from "@clubedge/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@clubedge/ui/components/card";

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

/** The signed-in user's plan, with checkout or the billing portal. Forms post to /billing/*. */
export function BillingCard({ billing }: { billing: BillingStatus }) {
  const { subscription } = billing;

  return (
    <Card className="gap-0 py-0" id="billing">
      <CardHeader className="flex-row items-start justify-between gap-3 border-b px-5 py-5 sm:px-6">
        <div className="grid gap-1">
          <CardTitle className="text-base">Billing</CardTitle>
          <CardDescription>Your plan and payment details.</CardDescription>
        </div>
        <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
          <CreditCard aria-hidden="true" className="size-4" />
        </span>
      </CardHeader>
      <CardContent className="grid gap-4 px-5 py-5 sm:px-6">
        {!billing.configured ? (
          <p className="text-sm text-muted-foreground">
            Payments are not configured yet. Set the Stripe variables in{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              apps/web/.env.local
            </code>
            .
          </p>
        ) : !billing.signedIn ? (
          <p className="text-sm text-muted-foreground">Sign in to choose a plan.</p>
        ) : subscription ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{subscription.planName}</span>
              <Badge variant={subscription.entitled ? "default" : "secondary"}>
                {subscription.status.replace(/_/g, " ")}
              </Badge>
            </div>
            {subscription.currentPeriodEnd && (
              <p className="text-sm text-muted-foreground">
                {subscription.cancelAtPeriodEnd ? "Ends" : "Renews"} on{" "}
                {dateFormat.format(new Date(subscription.currentPeriodEnd))}.
              </p>
            )}
            <form action="/billing/portal" method="post">
              <Button type="submit" variant="outline">
                Manage billing
              </Button>
            </form>
          </>
        ) : (
          plans.map((plan) => (
            <form
              action="/billing/checkout"
              className="flex flex-wrap items-center justify-between gap-3"
              key={plan.id}
              method="post"
            >
              <input name="planId" type="hidden" value={plan.id} />
              <div className="grid gap-0.5">
                <span className="font-medium">{plan.name}</span>
                <span className="text-sm text-muted-foreground">{plan.description}</span>
              </div>
              <Button type="submit">Upgrade to {plan.name}</Button>
            </form>
          ))
        )}
      </CardContent>
    </Card>
  );
}

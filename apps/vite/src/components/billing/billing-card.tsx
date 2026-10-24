import { useEffect, useState } from "react";
import { CreditCard } from "lucide-react";

import type { Billing, BillingRedirect } from "@clubedge/contract";
import { Badge } from "@clubedge/ui/components/badge";
import { Button } from "@clubedge/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@clubedge/ui/components/card";
import { api } from "@/lib/api";

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

type Redirect = { data?: BillingRedirect; error?: { error?: { message?: string } } };

const unavailable = "Billing is unavailable right now. Try again in a moment.";

/**
 * The signed-in user's plan, with checkout or the billing portal. The API answers with the
 * provider's hosted page, and the browser goes there.
 */
export function BillingCard() {
  // clubedge:if shell!=none
  // App store rules keep payments out of the mobile app: billing stays on the website. The mode
  // is fixed per build, so the hooks below run on every render, or on none.
  if (import.meta.env.MODE === "app") return null;
  // clubedge:end
  const [billing, setBilling] = useState<Billing | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.GET("/api/billing").then(
      ({ data }) => {
        if (!active) return;
        if (data) setBilling(data);
        else setLoadFailed(true);
      },
      () => active && setLoadFailed(true),
    );
    return () => {
      active = false;
    };
  }, []);

  async function redirect(request: () => Promise<Redirect>) {
    setPending(true);
    setError(null);
    try {
      const { data, error: failure } = await request();
      if (data) {
        window.location.assign(data.url);
        return;
      }
      setError(failure?.error?.message ?? unavailable);
    } catch {
      setError(unavailable);
    }
    setPending(false);
  }

  const subscription = billing?.subscription;
  const planName = (id: string | null) =>
    billing?.plans.find((plan) => plan.id === id)?.name ?? "Unknown plan";

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
        {loadFailed ? (
          <p className="text-sm text-muted-foreground">{unavailable}</p>
        ) : !billing ? (
          <p className="text-sm text-muted-foreground">Loading your plan…</p>
        ) : !billing.configured ? (
          <p className="text-sm text-muted-foreground">
            Payments are not configured yet. Set the Stripe variables in{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              apps/api/.env.local
            </code>
            .
          </p>
        ) : subscription ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{planName(subscription.planId)}</span>
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
            <div>
              <Button
                disabled={pending}
                onClick={() => redirect(() => api.POST("/api/billing/portal", { body: {} }))}
                type="button"
                variant="outline"
              >
                Manage billing
              </Button>
            </div>
          </>
        ) : (
          billing.plans.map((plan) => (
            <div className="flex flex-wrap items-center justify-between gap-3" key={plan.id}>
              <div className="grid gap-0.5">
                <span className="font-medium">{plan.name}</span>
                <span className="text-sm text-muted-foreground">{plan.description}</span>
              </div>
              <Button
                disabled={pending}
                onClick={() =>
                  redirect(() => api.POST("/api/billing/checkout", { body: { planId: plan.id } }))
                }
                type="button"
              >
                Upgrade to {plan.name}
              </Button>
            </div>
          ))
        )}
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

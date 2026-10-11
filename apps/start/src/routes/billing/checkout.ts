import { createFileRoute } from "@tanstack/react-router";
import { handleCheckout } from "@/server/billing-forms";

export const Route = createFileRoute("/billing/checkout")({
  server: {
    handlers: {
      GET: () => new Response(null, { status: 303, headers: { Location: "/dashboard" } }),
      POST: ({ request }) => handleCheckout(request),
    },
  },
});

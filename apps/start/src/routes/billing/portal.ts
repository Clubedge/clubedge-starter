import { createFileRoute } from "@tanstack/react-router";
import { handlePortal } from "@/server/billing-forms";

export const Route = createFileRoute("/billing/portal")({
  server: {
    handlers: {
      GET: () => new Response(null, { status: 303, headers: { Location: "/dashboard" } }),
      POST: () => handlePortal(),
    },
  },
});

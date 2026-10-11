import { createFileRoute } from "@tanstack/react-router";
import { handleFormEndpointVisit, handleResetPassword } from "@/server/auth-forms";

export const Route = createFileRoute("/auth/reset-password")({
  server: {
    handlers: {
      GET: () => handleFormEndpointVisit(),
      POST: ({ request }) => handleResetPassword(request),
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { handleFormEndpointVisit, handleForgotPassword } from "@/server/auth-forms";

export const Route = createFileRoute("/auth/forgot-password")({
  server: {
    handlers: {
      GET: () => handleFormEndpointVisit(),
      POST: ({ request }) => handleForgotPassword(request),
    },
  },
});

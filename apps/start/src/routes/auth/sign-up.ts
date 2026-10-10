import { createFileRoute } from "@tanstack/react-router";
import { handleFormEndpointVisit, handleSignUp } from "@/server/auth-forms";

export const Route = createFileRoute("/auth/sign-up")({
  server: {
    handlers: {
      GET: () => handleFormEndpointVisit(),
      POST: ({ request }) => handleSignUp(request),
    },
  },
});

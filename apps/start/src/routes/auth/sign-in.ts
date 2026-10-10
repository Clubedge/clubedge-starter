import { createFileRoute } from "@tanstack/react-router";
import { handleFormEndpointVisit, handleSignIn } from "@/server/auth-forms";

export const Route = createFileRoute("/auth/sign-in")({
  server: {
    handlers: {
      GET: () => handleFormEndpointVisit(),
      POST: ({ request }) => handleSignIn(request),
    },
  },
});

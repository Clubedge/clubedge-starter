import { createFileRoute } from "@tanstack/react-router";
import { handleFormEndpointVisit, handleSignOut } from "@/server/auth-forms";

export const Route = createFileRoute("/auth/sign-out")({
  server: {
    handlers: {
      GET: () => handleFormEndpointVisit(),
      POST: () => handleSignOut(),
    },
  },
});

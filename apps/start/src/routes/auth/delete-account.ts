import { createFileRoute } from "@tanstack/react-router";
import { handleFormEndpointVisit } from "@/server/auth-forms";
import { handleDeleteAccount } from "@/server/settings-forms";

export const Route = createFileRoute("/auth/delete-account")({
  server: {
    handlers: {
      GET: () => handleFormEndpointVisit(),
      POST: ({ request }) => handleDeleteAccount(request),
    },
  },
});

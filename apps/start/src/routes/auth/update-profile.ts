import { createFileRoute } from "@tanstack/react-router";
import { handleFormEndpointVisit } from "@/server/auth-forms";
import { handleUpdateProfile } from "@/server/settings-forms";

export const Route = createFileRoute("/auth/update-profile")({
  server: {
    handlers: {
      GET: () => handleFormEndpointVisit(),
      POST: ({ request }) => handleUpdateProfile(request),
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { handleFormEndpointVisit } from "@/server/auth-forms";
import { handleChangePassword } from "@/server/settings-forms";

export const Route = createFileRoute("/auth/change-password")({
  server: {
    handlers: {
      GET: () => handleFormEndpointVisit(),
      POST: ({ request }) => handleChangePassword(request),
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { handleAuthCallback } from "@/server/auth-forms";

export const Route = createFileRoute("/auth/callback")({
  server: {
    handlers: {
      GET: ({ request }) => handleAuthCallback(request),
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { handleSampleJob } from "@/server/jobs-forms";

export const Route = createFileRoute("/jobs/sample")({
  server: {
    handlers: {
      GET: () => new Response(null, { status: 303, headers: { Location: "/dashboard" } }),
      POST: () => handleSampleJob(),
    },
  },
});

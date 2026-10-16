import { createFileRoute } from "@tanstack/react-router";
import { getJobs } from "@/server/jobs";

/**
 * Inngest calls this endpoint to find the app's jobs (GET, PUT) and to run each one (POST). Its
 * signing key authenticates the calls; providers that run jobs themselves answer 404.
 */
async function handle({ request }: { request: Request }): Promise<Response> {
  const jobs = getJobs();
  if (!jobs.handler) return Response.json({ error: "Not found" }, { status: 404 });
  return await jobs.handler(request);
}

export const Route = createFileRoute("/api/inngest")({
  server: { handlers: { GET: handle, POST: handle, PUT: handle } },
});

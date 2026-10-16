import { getJobs } from "@/server/jobs";

export const dynamic = "force-dynamic";

/**
 * Inngest calls this endpoint to find the app's jobs (GET, PUT) and to run each one (POST). Its
 * signing key authenticates the calls; providers that run jobs themselves answer 404.
 */
async function handle(request: Request): Promise<Response> {
  const jobs = getJobs();
  if (!jobs.handler) return Response.json({ error: "Not found" }, { status: 404 });
  return await jobs.handler(request);
}

export { handle as GET, handle as POST, handle as PUT };

// Inngest calls this endpoint to find the API's jobs (GET, PUT) and to run each one (POST), through
// the frontend's proxy. Its signing key authenticates the calls, so the request goes to Inngest's
// handler as it came: no JSON-only guard, and the body unread.
import { Hono } from "hono";
import { apiError } from "@/http";
import type { BackgroundJobs } from "@/routes/jobs";

export function inngestRoutes(jobs: BackgroundJobs) {
  return new Hono().on(["GET", "PUT", "POST"], "/api/inngest", async (c) => {
    const queue = jobs.queue();
    if (!queue.handler) return apiError(c, 404, "not_found", "No such API endpoint.");
    return await queue.handler(c.req.raw);
  });
}

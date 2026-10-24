import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Health, Ready, Session, User } from "@clubedge/contract";
import { reportError } from "@clubedge/core";
import { apiError } from "@/http";
import type { CreateRateLimiter } from "@/rate-limit";
// clubedge:if observability!=none
import type { BrowserErrorReporting } from "@clubedge/observability";
import { clientErrorRoutes } from "@/routes/client-errors";
import { requestTracing } from "@/tracing";
// clubedge:end
// clubedge:if jobs!=none
import { jobsRoutes, type BackgroundJobs } from "@/routes/jobs";
// clubedge:end
// clubedge:if jobs=pg-boss|bullmq
import { jobsRunRoutes } from "@/routes/jobs-run";
// clubedge:end
// clubedge:if jobs=inngest
import { inngestRoutes } from "@/routes/inngest";
// clubedge:end

/** What the routes need from the composition root (src/server), so tests can pass stand-ins. */
export interface ApiDependencies {
  serviceId: string;
  frontendOrigin?: string;
  isReady(): Promise<boolean>;
  getCurrentUser(request: Request): Promise<User | null>;
  /** Limits for routes anyone can call (src/server/cache); process memory when absent. */
  createRateLimiter?: CreateRateLimiter;
  // clubedge:if observability!=none
  /** How the browser reports its errors (src/server/observability); not at all when absent. */
  browserErrorReporting?(): BrowserErrorReporting;
  // clubedge:end
  // clubedge:if jobs!=none
  /** Background jobs (src/server/jobs); their routes answer 404 when absent. */
  jobs?: BackgroundJobs;
  // clubedge:end
}

/** The API, implementing packages/contract/openapi.yaml. */
export function createApp(dependencies: ApiDependencies) {
  const app = new Hono();
  app.use("/api/*", requestTracing); // clubedge:only observability!=none
  app.use(
    "/api/*",
    cors({
      origin: dependencies.frontendOrigin ?? "http://localhost:3000",
      allowHeaders: ["Authorization", "Content-Type"],
      allowMethods: ["GET", "POST", "OPTIONS"],
      maxAge: 600,
    }),
  );

  app.get("/api/health", (c) =>
    c.json<Health>({
      status: "ok",
      service: dependencies.serviceId,
      timestamp: new Date().toISOString(),
    }),
  );

  app.get("/api/ready", async (c) => {
    const ready = await dependencies.isReady();
    c.header("Cache-Control", "no-store");
    return c.json<Ready>({ status: ready ? "ok" : "unavailable" }, ready ? 200 : 503);
  });

  app.get("/api/session", async (c) =>
    c.json<Session>({ user: await dependencies.getCurrentUser(c.req.raw) }),
  );

  // clubedge:if observability!=none
  app.route("/", clientErrorRoutes(dependencies));
  // clubedge:end
  // clubedge:if jobs!=none
  if (dependencies.jobs) {
    app.route("/", jobsRoutes(dependencies.jobs, dependencies));
    app.route("/", jobsRunRoutes(dependencies.jobs)); // clubedge:only jobs=pg-boss|bullmq
    app.route("/", inngestRoutes(dependencies.jobs)); // clubedge:only jobs=inngest
  }
  // clubedge:end

  app.notFound((c) => apiError(c, 404, "not_found", "No such API endpoint."));
  app.onError((error, c) => {
    reportError(error, {
      message: "Request failed",
      attributes: { "http.request.method": c.req.method, "url.path": c.req.path },
    });
    return apiError(c, 500, "internal_error", "Something went wrong.");
  });
  return app;
}

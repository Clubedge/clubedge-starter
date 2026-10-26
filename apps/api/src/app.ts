import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppVersion, Health, Ready, Session, User } from "@clubedge/contract";
import { reportError, type ClientIpSettings } from "@clubedge/core";
import { getClientIp } from "@clubedge/core"; // clubedge:only framework=none && auth=better-auth
import { apiError } from "@/http";
import type { CreateRateLimiter } from "@/rate-limit";
import { socketAddress } from "@/rate-limit"; // clubedge:only framework=none && auth=better-auth
import { appVersionRoutes } from "@/routes/app-version";
// clubedge:if auth!=none
import { accountRoutes, type AccountService } from "@/routes/account";
// clubedge:end
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
// clubedge:if payments!=none
import { billingRoutes, type BillingDependencies } from "@/routes/billing";
// clubedge:end

/** What the routes need from the composition root (src/server), so tests can pass stand-ins. */
export interface ApiDependencies {
  serviceId: string;
  frontendOrigin?: string;
  isReady(): Promise<boolean>;
  getCurrentUser(request: Request): Promise<User | null>;
  /** Limits for routes anyone can call (src/server/cache); process memory when absent. */
  createRateLimiter?: CreateRateLimiter;
  /** The app versions installed apps check (src/server/app-version); all null when absent. */
  appVersion?(): AppVersion;
  /** Where those limits find the client's address; the connection's own when absent. */
  clientIpSettings?: ClientIpSettings;
  // clubedge:if auth!=none
  /** The account settings (src/server/account); they answer 503 not_configured when absent. */
  account?: AccountService;
  // clubedge:end
  // clubedge:if framework=none && auth=better-auth
  /** Better Auth's endpoints (src/server/auth), which run in the API when there is no website. */
  authHandler?(request: Request): Promise<Response>;
  // clubedge:end
  // clubedge:if observability!=none
  /** How the browser reports its errors (src/server/observability); not at all when absent. */
  browserErrorReporting?(): BrowserErrorReporting;
  // clubedge:end
  // clubedge:if jobs!=none
  /** Background jobs (src/server/jobs); their routes answer 404 when absent. */
  jobs?: BackgroundJobs;
  // clubedge:end
  // clubedge:if payments!=none
  /** Billing with the payment provider (src/server/payments); not configured when absent. */
  payments?: BillingDependencies;
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

  app.route("/", appVersionRoutes(dependencies));

  // clubedge:if auth!=none
  app.route("/", accountRoutes(dependencies));
  // clubedge:end
  // clubedge:if framework=none && auth=better-auth
  // Without a website, the mobile app signs in here. Better Auth limits requests per client
  // address, which it reads from X-Forwarded-For: it gets the one this API finds, never a copy the
  // client sent. The app, which sends no browser Origin, sends its own address (its scheme) as
  // expo-origin, which Better Auth checks as the origin, as Better Auth's Expo plugin would.
  const { authHandler } = dependencies;
  if (authHandler) {
    app.on(["GET", "POST"], "/api/auth/*", (c) => {
      const headers = new Headers(c.req.raw.headers);
      const settings = { ...dependencies.clientIpSettings, socketAddress: socketAddress(c) };
      headers.set("x-forwarded-for", getClientIp(c.req.raw.headers, settings));
      const appOrigin = headers.get("expo-origin");
      if (appOrigin && !headers.has("origin")) headers.set("origin", appOrigin);
      return authHandler(new Request(c.req.raw, { headers }));
    });
  }
  // clubedge:end

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
  // clubedge:if payments!=none
  app.route("/", billingRoutes(dependencies));
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

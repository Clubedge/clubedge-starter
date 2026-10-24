import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Health, Ready, Session, User } from "@clubedge/contract";
import { reportError } from "@clubedge/core";
import { apiError } from "@/http";

/** What the routes need from the composition root (src/server), so tests can pass stand-ins. */
export interface ApiDependencies {
  serviceId: string;
  frontendOrigin?: string;
  isReady(): Promise<boolean>;
  getCurrentUser(request: Request): Promise<User | null>;
}

/** The API, implementing packages/contract/openapi.yaml. */
export function createApp(dependencies: ApiDependencies) {
  const app = new Hono();
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

  app.notFound((c) => apiError(c, 404, "not_found", "No such API endpoint."));
  app.onError((error, c) => {
    reportError(error);
    return apiError(c, 500, "internal_error", "Something went wrong.");
  });
  return app;
}

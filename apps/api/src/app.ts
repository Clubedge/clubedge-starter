import { Hono } from "hono";
import type { ApiError, Health, Ready, Session, User } from "@clubedge/contract";
import { reportError } from "@clubedge/core";

/** What the routes need from the composition root (src/server), so tests can pass stand-ins. */
export interface ApiDependencies {
  serviceId: string;
  isReady(): Promise<boolean>;
  getCurrentUser(request: Request): Promise<User | null>;
}

const notFound: ApiError = { error: { code: "not_found", message: "No such API endpoint." } };
const internal: ApiError = { error: { code: "internal_error", message: "Something went wrong." } };

/** The API, implementing packages/contract/openapi.yaml. */
export function createApp(dependencies: ApiDependencies) {
  const app = new Hono();

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

  app.notFound((c) => c.json(notFound, 404));
  app.onError((error, c) => {
    reportError(error);
    return c.json(internal, 500);
  });
  return app;
}

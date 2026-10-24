import type { MiddlewareHandler } from "hono";
import { traced } from "@clubedge/core";
import { requestAttributes } from "@clubedge/observability";

/**
 * Traces each request as a span named by its method and path. An error that escapes a route
 * reaches app.onError inside this span, so its report is recorded on the span too.
 */
export const requestTracing: MiddlewareHandler = (c, next) => {
  const attributes = requestAttributes({ method: c.req.method, path: c.req.path });
  return traced(`${c.req.method} ${attributes["url.path"]}`, next, attributes);
};

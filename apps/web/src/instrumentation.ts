// clubedge:if observability!=none
import type { Instrumentation } from "next";
import { reportError } from "@clubedge/core";

// clubedge:end
/** Runs once when the server starts. */
export async function register() {
  // Server code belongs to the Node.js server: not the Edge runtime, and not `next build`.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  // A CLIENT_IP_HEADER or TRUSTED_PROXY_HOPS that cannot be right stops the server here.
  const { getClientIpSettings } = await import("./env/server");
  getClientIpSettings();
  // clubedge:if observability!=none
  const { startObservability } = await import("./server/observability");
  startObservability();
  // clubedge:end
  // clubedge:if jobs!=none
  const { startJobsWorker } = await import("./server/jobs");
  startJobsWorker();
  // clubedge:end
}
// clubedge:if observability!=none

/** Next.js reports errors from pages, route handlers, server actions, and the proxy here. */
export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  reportError(error, {
    message: "Request failed",
    attributes: {
      "http.request.method": request.method,
      "url.path": request.path.split("?")[0],
      "next.route": context.routePath,
      "next.route_type": context.routeType,
    },
  });
};
// clubedge:end

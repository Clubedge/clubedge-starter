import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/react-start";
// clubedge:if observability!=none
import { reportError, traced } from "@clubedge/core";
import { requestAttributes } from "@clubedge/observability";
// clubedge:end
import { refreshAuthSession } from "@/server/auth";

const securityHeaders: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
};

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

// Rejects cross-site form posts and server function calls (Next.js does this for actions).
// Webhooks are cross-site by design; their handlers verify the sender's signature instead.
const csrfProtection = createCsrfMiddleware({
  filter: ({ request }) =>
    !safeMethods.has(request.method) && !new URL(request.url).pathname.startsWith("/api/webhooks/"),
});

// Refreshed cookies reach both later handlers in this request and the browser response.
const sessionRefresh = createMiddleware().server(async ({ next }) => {
  await refreshAuthSession();
  return next();
});

const responseHeaders = createMiddleware().server(async ({ next }) => {
  const result = await next();
  let response = result.response;
  try {
    for (const [name, value] of Object.entries(securityHeaders)) response.headers.set(name, value);
  } catch {
    // Some responses have immutable headers; copy them into a mutable response.
    response = new Response(response.body, response);
    for (const [name, value] of Object.entries(securityHeaders)) response.headers.set(name, value);
  }
  return { ...result, response };
});

// clubedge:if observability!=none
// Traces each request, and reports errors that escape route handlers and server functions.
const requestTracing = createMiddleware().server(async ({ next, request }) => {
  const attributes = requestAttributes(request);
  return traced(
    `${request.method} ${attributes["url.path"]}`,
    async () => {
      try {
        return await next();
      } catch (error) {
        reportError(error, { message: "Request failed", attributes });
        throw error;
      }
    },
    attributes,
  );
});

const serverFunctionErrors = createMiddleware({ type: "function" }).server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    reportError(error, { message: "Server function failed" });
    throw error;
  }
});

// clubedge:end
export const startInstance = createStart(() => ({
  requestMiddleware: [
    // Outermost first.
    requestTracing, // clubedge:only observability!=none
    responseHeaders,
    csrfProtection,
    sessionRefresh,
  ],
  functionMiddleware: [serverFunctionErrors], // clubedge:only observability!=none
}));

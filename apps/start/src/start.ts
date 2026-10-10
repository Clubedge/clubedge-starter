import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/react-start";
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
const csrfProtection = createCsrfMiddleware({
  filter: ({ request }) => !safeMethods.has(request.method),
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

export const startInstance = createStart(() => ({
  requestMiddleware: [responseHeaders, csrfProtection, sessionRefresh],
}));

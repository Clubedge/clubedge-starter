import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// Plain ?key=value search params, as in the Next.js app and the URLs built by loginUrl().
// The router's default JSON encoding would rewrite ?check-email=1 to ?check-email=%221%22.
function parseSearch(search: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(search));
}

function stringifySearch(search: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (value !== undefined && value !== null) params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function getRouter() {
  return createRouter({
    routeTree,
    parseSearch,
    stringifySearch,
    scrollRestoration: true,
    defaultPreload: "intent",
  });
}

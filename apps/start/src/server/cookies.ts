import "@tanstack/react-start/server-only";
import { getCookies, getRequest, setCookie } from "@tanstack/react-start/server";
import type { CookieStore } from "@clubedge/auth";

const jars = new WeakMap<Request, CookieStore>();

/**
 * Bridges TanStack Start request cookies to the framework-agnostic CookieStore.
 *
 * There is one jar per request, so a session refreshed by the request middleware is visible
 * to the server functions and routes that run later in the same request, and every write
 * is also sent to the browser.
 */
export function requestCookieStore(): CookieStore {
  const request = getRequest();
  const existing = jars.get(request);
  if (existing) return existing;

  const values = new Map(Object.entries(getCookies()));
  const store: CookieStore = {
    getAll: () => Array.from(values, ([name, value]) => ({ name, value })),
    setAll(cookies) {
      for (const { name, value, options } of cookies) {
        values.set(name, value);
        setCookie(name, value, options);
      }
    },
  };
  jars.set(request, store);
  return store;
}

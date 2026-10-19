// The API contract for TypeScript: the types generated from openapi.yaml and a typed client.
// A frontend calls its API only through this client, so it works with any API stack.
import createClient from "openapi-fetch";
import type { components, paths } from "./schema";

export type { components, paths };
export type Health = components["schemas"]["Health"];
export type Ready = components["schemas"]["Ready"];
export type Session = components["schemas"]["Session"];
export type User = components["schemas"]["User"];
export type ApiError = components["schemas"]["Error"];

/**
 * A typed client for the API. Paths start with /api, so the default base URL (the page's own
 * origin) reaches the API through the frontend's proxy and keeps cookies first-party.
 */
export function createApiClient(
  options: {
    baseUrl?: string;
    fetch?: typeof fetch;
    accessToken?: () => Promise<string | undefined>;
  } = {},
) {
  const fetcher = options.accessToken
    ? async (input: RequestInfo | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        const token = await options.accessToken!();
        if (token) headers.set("Authorization", `Bearer ${token}`);
        return (options.fetch ?? fetch)(input, { ...init, headers });
      }
    : options.fetch;
  return createClient<paths>({
    baseUrl: options.baseUrl ?? "",
    ...(fetcher ? { fetch: fetcher } : {}),
  });
}

export type ApiClient = ReturnType<typeof createApiClient>;

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
export type BrowserErrorReporting = components["schemas"]["BrowserErrorReporting"];
export type ClientErrorReport = components["schemas"]["ClientErrorReport"];

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
  const client = createClient<paths>({
    baseUrl: options.baseUrl ?? "",
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  if (options.accessToken) {
    const getAccessToken = options.accessToken;
    client.use({
      async onRequest({ request }) {
        const token = await getAccessToken();
        if (token) request.headers.set("Authorization", `Bearer ${token}`);
        return request;
      },
    });
  }
  return client;
}

export type ApiClient = ReturnType<typeof createApiClient>;

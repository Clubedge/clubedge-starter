/**
 * Sends one of the API client's requests to React Native's fetch as an address and its options,
 * the way Better Auth's client sends its own. `extraHeaders`, such as the session's, are added to
 * the request's own; the app sends no cookies of its own.
 */
export async function send(
  input: RequestInfo | URL,
  init?: RequestInit,
  extraHeaders: Record<string, string> = {},
): Promise<Response> {
  // The API client (openapi-fetch) always hands over a Request.
  const request = input as Request;
  const headers: Record<string, string> = {};
  request.headers.forEach((value, name) => {
    headers[name] = value;
  });
  Object.assign(headers, extraHeaders);
  const body =
    request.method === "GET" || request.method === "HEAD" ? undefined : await request.text();
  return fetch(request.url, {
    ...init,
    method: request.method,
    headers,
    body,
    credentials: "omit",
  });
}

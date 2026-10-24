// What routes share: the contract's error shape, and request guards for mutating routes.
import type { Context, MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ApiError } from "@clubedge/contract";

/** A JSON error in the contract's shape, such as 401 unauthorized. */
export function apiError(c: Context, status: ContentfulStatusCode, code: string, message: string) {
  return c.json<ApiError>({ error: { code, message } }, status);
}

/** Refuses a body over `maxSize` bytes with 413, while it streams in. */
export function limitBody(maxSize: number): MiddlewareHandler {
  return bodyLimit({
    maxSize,
    onError: (c) => apiError(c, 413, "payload_too_large", "The request body is too large."),
  });
}

/**
 * Accepts only JSON on a mutating route. Another site can make a browser post a form (urlencoded,
 * multipart, or text/plain) with the user's cookies, but not JSON: that needs a CORS preflight,
 * which only the frontend's origin passes. Webhooks are signed by their sender instead.
 */
export const jsonOnly: MiddlewareHandler = async (c, next) => {
  if (!/^application\/json\s*(;|$)/i.test(c.req.header("content-type") ?? "")) {
    return apiError(c, 415, "unsupported_media_type", "Send the request body as JSON.");
  }
  await next();
};

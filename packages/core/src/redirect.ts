const placeholderOrigin = "http://localhost";

/**
 * Returns a same-origin path for post-authentication redirects. Anything that could leave
 * the site (absolute URLs, protocol-relative URLs, backslash tricks) falls back.
 */
export function safeRedirectPath(value: unknown, fallback = "/dashboard"): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }
  if (value.includes("\\")) return fallback;

  try {
    const url = new URL(value, placeholderOrigin);
    if (url.origin !== placeholderOrigin) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

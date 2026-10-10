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

type LoginUrlOptions = {
  mode?: "signin" | "signup";
  error?: string;
  next?: string;
  checkEmail?: boolean;
};

export function loginUrl({ mode = "signin", error, next, checkEmail }: LoginUrlOptions = {}) {
  const params = new URLSearchParams();
  if (mode === "signup") params.set("mode", "signup");
  if (error) params.set("error", error);
  if (checkEmail) params.set("check-email", "1");
  if (next && next !== "/dashboard") params.set("next", next);
  const query = params.toString();
  return query ? `/login?${query}` : "/login";
}

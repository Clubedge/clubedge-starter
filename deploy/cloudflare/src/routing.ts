// What the Worker decides on its own, apart from Cloudflare's runtime (./index.ts): which
// requests are the API's, and the settings the API's container starts with.

/** The API's paths: everything under /api. The rest is the website. */
export function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

/**
 * The API container's environment: each of the Worker's variables and secrets that holds text (its
 * bindings, such as the container's own, are objects, and stay out), and the website's origin as
 * FRONTEND_URL unless one is set.
 */
export function containerEnv(
  env: Readonly<Record<string, unknown>>,
  origin: string,
): Record<string, string> {
  const settings: Record<string, string> = {};
  for (const [name, value] of Object.entries(env)) {
    if (typeof value === "string" && value.trim() !== "") settings[name] = value;
  }
  settings.FRONTEND_URL ??= origin;
  return settings;
}

/** At most, by Cloudflare's limit: six hours. */
const MAX_IDLE_MINUTES = 360;

/**
 * How long the API keeps running once nothing reaches it, before it stops until the next request:
 * API_IDLE_MINUTES, an hour unless set.
 */
export function idleTimeoutMs(env: Readonly<Record<string, unknown>>): number {
  const minutes = Number(env.API_IDLE_MINUTES ?? 60);
  const valid = Number.isFinite(minutes) && minutes > 0 ? minutes : 60;
  return Math.min(valid, MAX_IDLE_MINUTES) * 60_000;
}

/** The regions Cloudflare can be asked to start a Durable Object in: its location hints. */
const LOCATIONS = ["wnam", "enam", "sam", "weur", "eeur", "apac", "oc", "afr", "me"] as const;
export type Location = (typeof LOCATIONS)[number];

/**
 * The region the API is asked to start in, the first time it starts: API_LOCATION, one of
 * Cloudflare's location hints, such as weur for western Europe. Unset, or not one of them, it is
 * undefined, and Cloudflare starts the API near the first request that reaches it.
 */
export function apiLocation(env: Readonly<Record<string, unknown>>): Location | undefined {
  return LOCATIONS.find((location) => location === env.API_LOCATION);
}

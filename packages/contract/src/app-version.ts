// How apps installed on phones and the API agree on updates (GET /api/app-version), in one place
// for the TypeScript API and both apps: the headers each request from an app carries, and what
// the app does for the versions the API serves. The Python API follows the same rules.
import type { components } from "./schema";

type AppVersion = components["schemas"]["AppVersion"];

/** The header each request from an installed app carries: its version, such as 1.4.0. */
export const APP_VERSION_HEADER = "X-App-Version";

/** The header naming the platform the app runs on, for that platform's versions and link. */
export const APP_PLATFORM_HEADER = "X-App-Platform";

/** The platforms the API can give their own versions and update link. */
export const appPlatforms = ["ios", "android"] as const;
export type AppPlatform = (typeof appPlatforms)[number];

/** The platform a request names, or null for none or any other value. */
export function appPlatform(value: string | null | undefined): AppPlatform | null {
  const platform = value?.trim().toLowerCase();
  return appPlatforms.find((known) => known === platform) ?? null;
}

/**
 * A version's MAJOR, MINOR, and PATCH numbers, or null when it is not one. Missing parts count
 * as 0, since Android and iOS versions often start at "1.0".
 */
export function parseVersion(version: string): [number, number, number] | null {
  const match = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(version.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)];
}

/**
 * Whether `version` comes before `than`: MAJOR, then MINOR, then PATCH, number by number, so
 * 1.9.0 comes before 1.10.0. False when either is not a version.
 */
export function isOlder(version: string, than: string): boolean {
  const a = parseVersion(version);
  const b = parseVersion(than);
  if (!a || !b) return false;
  const index = a.findIndex((part, at) => part !== b[at]);
  return index !== -1 && a[index]! < b[index]!;
}

/**
 * What an installed app does for the versions the API serves:
 *
 * - "required": below the minimum. The app shows only its update screen, and the API answers
 *   its other requests 426 update_required.
 * - "upcoming": below a minimum the API has announced for a date (nextMinimumFrom). The app
 *   still works, and tells its user to update before then.
 * - "available": below the latest only. The app may say an update is out.
 * - "current": none of these.
 *
 * Null when it can't tell: an installed version that is not MAJOR.MINOR.PATCH, or no answer
 * from the API (offline, or an API from before these fields, whose missing ones count as null).
 */
export type UpdateStatus = "current" | "available" | "upcoming" | "required";

export function updateStatus(
  installed: string,
  versions: Partial<AppVersion> | null,
): UpdateStatus | null {
  if (!versions || !parseVersion(installed)) return null;
  const below = (version: string | null | undefined) => !!version && isOlder(installed, version);
  if (below(versions.minimumVersion)) return "required";
  if (below(versions.nextMinimumVersion)) return "upcoming";
  if (below(versions.latestVersion)) return "available";
  return "current";
}

import type { AppVersion } from "@clubedge/contract";

// The same rules as the mobile shell's (packages/mobile), so both apps read the API's versions
// alike.

/**
 * A version's MAJOR, MINOR, and PATCH numbers, or null when it is not one. Missing parts count
 * as 0, since Android and iOS versions often start at "1.0".
 */
export function parseVersion(version: string): [number, number, number] | null {
  const match = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(version.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)];
}

/** Whether `version` comes before `other`: MAJOR, then MINOR, then PATCH, number by number. */
export function isOlder(version: [number, number, number], other: [number, number, number]) {
  const index = version.findIndex((part, at) => part !== other[at]);
  return index !== -1 && version[index]! < other[index]!;
}

/**
 * What the installed app tells its user, from its own version and the versions the API serves:
 * "required" below the minimum (the app cannot continue), "available" below the latest only,
 * and null otherwise. An installed version that is not MAJOR.MINOR.PATCH counts as current.
 */
export function updateFor(
  installed: string,
  versions: AppVersion | null,
): "required" | "available" | null {
  const current = parseVersion(installed);
  if (!current || !versions) return null;
  const below = (version: string | null) => {
    const served = version === null ? null : parseVersion(version);
    return served !== null && isOlder(current, served);
  };
  if (below(versions.minimumVersion)) return "required";
  if (below(versions.latestVersion)) return "available";
  return null;
}

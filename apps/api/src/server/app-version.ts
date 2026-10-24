import { z } from "zod";
import type { AppVersion } from "@clubedge/contract";
import { optional, parseEnv } from "@/env";

/** The variable `key`, holding a MAJOR.MINOR.PATCH version such as 1.4.0. */
const versionVariable = (key: string) =>
  optional(z.string().regex(/^\d+\.\d+\.\d+$/, `${key} is not MAJOR.MINOR.PATCH, such as 1.4.0`));

/** Whether `version` is older than `than`, number by number: 1.9.0 is older than 1.10.0. */
function isOlder(version: string, than: string): boolean {
  const a = version.split(".").map(Number);
  const b = than.split(".").map(Number);
  const index = a.findIndex((part, i) => part !== b[i]);
  return index !== -1 && a[index] < b[index];
}

// What /api/app-version tells the apps installed on phones. Unset, each is null.
const appVersionEnvSchema = z
  .object({
    // The oldest version the API still serves: older apps must update before they continue.
    APP_MINIMUM_VERSION: versionVariable("APP_MINIMUM_VERSION"),
    // The newest released version: older apps may show an update notice.
    APP_LATEST_VERSION: versionVariable("APP_LATEST_VERSION"),
    // Where apps get the update, such as their store listing.
    APP_UPDATE_URL: optional(
      z.url({ protocol: /^https$/, error: "APP_UPDATE_URL is not an https:// URL" }),
    ),
  })
  .refine(
    ({ APP_MINIMUM_VERSION: minimum, APP_LATEST_VERSION: latest }) =>
      !minimum || !latest || !isOlder(latest, minimum),
    {
      path: ["APP_LATEST_VERSION"],
      error: "APP_LATEST_VERSION is older than APP_MINIMUM_VERSION",
      // Checked once the rest is valid, so it compares two versions.
      when: ({ issues }) => issues.length === 0,
    },
  );

/**
 * The versions, read on each request: a mistake in the variables fails the request, and is
 * reported, rather than telling the apps something wrong.
 */
export function appVersion(): AppVersion {
  const env = parseEnv(appVersionEnvSchema, "App version");
  return {
    minimumVersion: env.APP_MINIMUM_VERSION || null,
    latestVersion: env.APP_LATEST_VERSION || null,
    updateUrl: env.APP_UPDATE_URL || null,
  };
}

/** The mistakes in the APP_* variables of `env`, which `pnpm check:env` lists before a deploy. */
export function appVersionProblems(env: Record<string, string | undefined>): string[] {
  const parsed = appVersionEnvSchema.safeParse(env);
  return parsed.success ? [] : parsed.error.issues.map(({ message }) => message);
}

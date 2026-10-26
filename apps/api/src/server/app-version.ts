import { z } from "zod";
import { appPlatforms, isOlder, type AppPlatform, type AppVersion } from "@clubedge/contract";
import { optional } from "@/env";

// What /api/app-version tells the apps installed on phones, from the APP_* variables. Each can
// be set for one platform by adding _IOS or _ANDROID to its name: that platform's value then
// wins, for apps that name it (X-App-Platform). Unset, each is null.

const versionVariable = (key: string) =>
  optional(z.string().regex(/^\d+\.\d+\.\d+$/, `${key} is not MAJOR.MINOR.PATCH, such as 1.4.0`));
const urlVariable = (key: string) =>
  optional(z.url({ protocol: /^https$/, error: `${key} is not an https:// URL` }));
const dateVariable = (key: string) =>
  optional(
    z.iso.datetime({
      offset: true,
      error: `${key} is not a date and time with its time zone, such as 2026-11-01T00:00:00Z`,
    }),
  );

const fields = {
  // The oldest version the API still serves: older apps must update before they continue.
  APP_MINIMUM_VERSION: versionVariable,
  // The newest released version: older apps may say an update is out.
  APP_LATEST_VERSION: versionVariable,
  // A minimum announced for a date: older apps keep working until then, and warn their users.
  APP_NEXT_MINIMUM_VERSION: versionVariable,
  APP_NEXT_MINIMUM_VERSION_FROM: dateVariable,
  // Where apps get the update, such as their store listing.
  APP_UPDATE_URL: urlVariable,
};
type Field = keyof typeof fields;

const suffixes = ["", ...appPlatforms.map((platform) => `_${platform.toUpperCase()}`)];
const formats = z.object(
  Object.fromEntries(
    suffixes.flatMap((suffix) =>
      Object.entries(fields).map(([key, schema]) => [key + suffix, schema(key + suffix)]),
    ),
  ),
);

type Env = Record<string, string | undefined>;

/** A variable's value for `platform`, its own when set, else the shared one, and its name. */
function setting(env: Env, field: Field, platform: AppPlatform | null) {
  const own = platform && `${field}_${platform.toUpperCase()}`;
  const ownValue = own ? env[own]?.trim() : "";
  if (own && ownValue) return { key: own, value: ownValue };
  return { key: field, value: env[field]?.trim() || null };
}

/** The versions that contradict each other, for each platform and for apps that name none. */
function inconsistencies(env: Env): string[] {
  const problems = new Set<string>();
  for (const platform of [null, ...appPlatforms]) {
    const minimum = setting(env, "APP_MINIMUM_VERSION", platform);
    const latest = setting(env, "APP_LATEST_VERSION", platform);
    const next = setting(env, "APP_NEXT_MINIMUM_VERSION", platform);
    const from = setting(env, "APP_NEXT_MINIMUM_VERSION_FROM", platform);
    if (minimum.value && latest.value && isOlder(latest.value, minimum.value)) {
      problems.add(`${latest.key} is older than ${minimum.key}`);
    }
    if (!next.value !== !from.value) {
      problems.add(`${next.key} and ${from.key} go together: set both, or neither`);
    }
    if (next.value && minimum.value && !isOlder(minimum.value, next.value)) {
      problems.add(`${next.key} is not newer than ${minimum.key}`);
    }
    if (next.value && latest.value && isOlder(latest.value, next.value)) {
      problems.add(`${latest.key} is older than ${next.key}`);
    }
  }
  return [...problems];
}

/** The mistakes in the APP_* variables of `env`, which `pnpm check:env` lists before a deploy. */
export function appVersionProblems(env: Env): string[] {
  const parsed = formats.safeParse(env);
  if (!parsed.success) return parsed.error.issues.map(({ message }) => message);
  // Checked once each is valid, so they compare versions.
  return inconsistencies(env);
}

/**
 * The versions for apps on `platform` at `now`, read on each request: a mistake in the
 * variables fails the request, and is reported, rather than telling the apps something wrong.
 * On its date, the announced minimum becomes the one the API requires, with no redeploy.
 */
export function appVersion(platform: AppPlatform | null = null, now = new Date()): AppVersion {
  const problems = appVersionProblems(process.env);
  if (problems.length > 0) {
    console.error("Invalid App version environment:", problems);
    throw new Error("App version environment validation failed. Check your .env.local file.");
  }
  const value = (field: Field) => setting(process.env, field, platform).value;
  const next = value("APP_NEXT_MINIMUM_VERSION");
  const from = value("APP_NEXT_MINIMUM_VERSION_FROM");
  const due = !!next && !!from && Date.parse(from) <= now.getTime();
  return {
    minimumVersion: due ? next : value("APP_MINIMUM_VERSION"),
    latestVersion: value("APP_LATEST_VERSION"),
    updateUrl: value("APP_UPDATE_URL"),
    nextMinimumVersion: due ? null : next,
    nextMinimumFrom: due || !from ? null : new Date(from).toISOString(),
  };
}

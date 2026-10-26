// The app versions the API serves, for apps installed on phones: they keep calling the API long
// after a release, so they ask here whether they must update, or may.
import { Hono } from "hono";
import { APP_PLATFORM_HEADER, appPlatform, type AppVersion } from "@clubedge/contract";
import type { ApiDependencies } from "@/app";

/** No version set: no app is asked to update. */
const unset: AppVersion = {
  minimumVersion: null,
  latestVersion: null,
  updateUrl: null,
  nextMinimumVersion: null,
  nextMinimumFrom: null,
};

export function appVersionRoutes(dependencies: ApiDependencies) {
  return new Hono().get("/api/app-version", (c) => {
    // Never cached, so a new minimum version applies on the app's next check.
    c.header("Cache-Control", "no-store");
    const platform = appPlatform(c.req.header(APP_PLATFORM_HEADER));
    return c.json<AppVersion>(dependencies.appVersion?.(platform) ?? unset);
  });
}

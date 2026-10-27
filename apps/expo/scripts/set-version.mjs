// Sets the version the stores show, and the update policy compares, in app.json:
//
//   pnpm --filter @clubedge/mobile-app set-version 1.5.0
//
// Each release needs a new version: both stores order builds by the build number, which
// app.config.ts makes from it (1.5.0 is build 1005000). Once the stores publish the release, set
// the API's APP_LATEST_VERSION to it, so the apps below it offer the update.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const appJson = join(import.meta.dirname, "../app.json");

/** "1.4.2" as [1, 4, 2], or null for anything else. */
export function parseVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value ?? "");
  return match ? match.slice(1).map(Number) : null;
}

/** The build number of a version, as app.config.ts makes it. */
export function buildNumber(version) {
  const [major, minor, patch] = parseVersion(version);
  return major * 1_000_000 + minor * 1_000 + patch;
}

/** Whether `next` comes after `current`. */
export function isNewer(next, current) {
  const [a, b] = [parseVersion(next), parseVersion(current) ?? [0, 0, 0]];
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function setVersion(next) {
  const parts = parseVersion(next);
  if (!parts) {
    fail(`Give the new version as major.minor.patch, such as 1.5.0, not "${next ?? ""}".`);
  }
  if (parts[0] > 2_099 || parts[1] > 999 || parts[2] > 999) {
    fail(`${next} is too large: minor and patch go up to 999, major to 2099.`);
  }
  const app = JSON.parse(readFileSync(appJson, "utf8"));
  const current = app.expo?.version;
  if (!isNewer(next, current)) {
    fail(
      `The app is already version ${current}: a release needs a newer version, as the stores refuse a build number they had.`,
    );
  }
  app.expo = { ...app.expo, version: next };
  writeFileSync(appJson, `${JSON.stringify(app, null, 2)}\n`);
  console.log(
    [
      `The app is version ${next} now (it was ${current}), build ${buildNumber(next)} in both stores.`,
      `Once the stores publish it, set APP_LATEST_VERSION=${next} in the API's environment, or`,
      "APP_LATEST_VERSION_IOS and APP_LATEST_VERSION_ANDROID while one store is still reviewing it.",
    ].join("\n"),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  setVersion(process.argv[2]);
}

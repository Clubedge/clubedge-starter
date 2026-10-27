// The version the stores show, and the update policy compares, in version.json; build.mjs writes
// it into the Android and iOS projects at each build, with the build number both stores order
// builds by, made from it (1.4.2 is build 1004002). Set a new one for each release:
//
//   node scripts/version.mjs 1.5.0      (pnpm set-version 1.5.0)
//
// Once the stores publish it, set the API's APP_LATEST_VERSION to it, so the apps below it offer
// the update.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const shellDirectory = join(import.meta.dirname, "..");
const versionFile = join(shellDirectory, "version.json");

/** "1.4.2" as [1, 4, 2], or null for anything else, or one too large for a build number. */
export function parseVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value ?? "");
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  return parts[0] > 2_099 || parts[1] > 999 || parts[2] > 999 ? null : parts;
}

/** The build number of a version: 1.4.2 is 1004002. */
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

/** The app's version, from version.json. */
export function readVersion() {
  const { version } = JSON.parse(readFileSync(versionFile, "utf8"));
  if (!parseVersion(version)) {
    throw new Error(
      `version.json's version must be major.minor.patch, such as 1.4.2, not "${version}".`,
    );
  }
  return version;
}

/** Android's build file with the version and build number, in Groovy or Kotlin. */
export function versionGradle(text, version) {
  return text
    .replace(/(versionCode\s*=?\s*)\d+/, `$1${buildNumber(version)}`)
    .replace(/(versionName\s*=?\s*)"[^"]*"/, `$1"${version}"`);
}

/** The Xcode project with the version and build number, in each of its configurations. */
export function versionXcodeProject(text, version) {
  return text
    .replace(/MARKETING_VERSION = [^;]*;/g, `MARKETING_VERSION = ${version};`)
    .replace(
      /CURRENT_PROJECT_VERSION = [^;]*;/g,
      `CURRENT_PROJECT_VERSION = ${buildNumber(version)};`,
    );
}

/** The version a native project has now: versionName, or MARKETING_VERSION. */
export function nativeVersion(text) {
  return (
    /versionName\s*=?\s*"([^"]*)"/.exec(text)?.[1] ?? /MARKETING_VERSION = ([^;]*);/.exec(text)?.[1]
  );
}

/**
 * Writes the version into the native projects that exist. A project with a newer version, such
 * as one set by hand before the version moved to version.json, is not taken back: the build
 * stops and says how to carry the version over.
 */
export function applyVersion(version = readVersion()) {
  const files = [
    ["android/app/build.gradle", versionGradle],
    ["android/app/build.gradle.kts", versionGradle],
    ["ios/App/App.xcodeproj/project.pbxproj", versionXcodeProject],
  ];
  for (const [path, edit] of files) {
    const file = join(shellDirectory, path);
    if (!existsSync(file)) continue;
    const text = readFileSync(file, "utf8");
    const current = nativeVersion(text);
    if (parseVersion(current) && isNewer(current, version)) {
      throw new Error(
        `${path} has version ${current}, newer than version.json's ${version}. The version is kept in version.json now: carry it over with pnpm --filter @clubedge/shell set-version ${current}.`,
      );
    }
    const updated = edit(text, version);
    if (updated !== text) writeFileSync(file, updated);
  }
}

function setVersion(next) {
  if (!parseVersion(next)) {
    console.error(`Give the new version as major.minor.patch, such as 1.5.0, not "${next ?? ""}".`);
    process.exit(1);
  }
  const current = readVersion();
  if (!isNewer(next, current)) {
    console.error(
      `The app is already version ${current}: a release needs a newer version, as the stores refuse a build number they had.`,
    );
    process.exit(1);
  }
  // The native projects first: one with a newer version stops this before version.json changes.
  try {
    applyVersion(next);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  writeFileSync(versionFile, `${JSON.stringify({ version: next }, null, 2)}\n`);
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

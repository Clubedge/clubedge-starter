// Builds the app's store release for one platform, signed:
//
//   node scripts/release.mjs android    (pnpm release android): an App Bundle for Google Play
//   node scripts/release.mjs ios        (pnpm release ios): an IPA for the App Store
//
// It builds the web app for the app and updates the native project first (build.mjs), with the
// version in version.json, then Capacitor builds and signs it with the settings from the
// environment, which capacitor.config.ts passes on:
// - Android: the upload key, ANDROID_KEYSTORE_PATH, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS,
//   and ANDROID_KEY_PASSWORD.
// - iOS: IOS_TEAM_ID, with Xcode's automatic signing; or, as in CI, a certificate and a
//   provisioning profile installed beforehand, named by IOS_SIGNING_CERTIFICATE and
//   IOS_PROVISIONING_PROFILE.
// The signed file is copied to release/, which Git ignores.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "./build.mjs";
import { readVersion } from "./version.mjs";

const shellDirectory = join(import.meta.dirname, "..");
const releaseDirectory = join(shellDirectory, "release");

/** What each platform's signing needs from the environment. */
export const signingVariables = {
  android: [
    "ANDROID_KEYSTORE_PATH",
    "ANDROID_KEYSTORE_PASSWORD",
    "ANDROID_KEY_ALIAS",
    "ANDROID_KEY_PASSWORD",
  ],
  ios: ["IOS_TEAM_ID"],
};

// Where Capacitor writes each platform's signed file.
const outputs = {
  android: { directory: "android/app/build/outputs/bundle/release", extension: ".aab" },
  ios: { directory: "ios/App/output", extension: ".ipa" },
};

function fail(message) {
  console.error(message);
  process.exit(1);
}

/** The newest file of `directory` with `extension`, written since `since`, or null. */
function newest(directory, extension, since) {
  if (!existsSync(directory)) return null;
  return (
    readdirSync(directory)
      .filter((name) => name.endsWith(extension))
      .map((name) => join(directory, name))
      .filter((file) => statSync(file).mtimeMs >= since)
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0] ?? null
  );
}

function release(platform) {
  if (!signingVariables[platform]) fail(`Choose android or ios, such as: pnpm release android`);
  const missing = signingVariables[platform].filter((name) => !process.env[name]);
  if (missing.length > 0) {
    fail(`Set ${missing.join(", ")} to sign the release: SETUP.md, "Store releases", says how.`);
  }
  if (platform === "android" && !existsSync(process.env.ANDROID_KEYSTORE_PATH)) {
    fail(`ANDROID_KEYSTORE_PATH names no file: ${process.env.ANDROID_KEYSTORE_PATH}`);
  }
  const version = readVersion();
  build([platform]);

  const started = Date.now();
  const args = [
    "build",
    platform,
    ...(platform === "ios" ? ["--xcode-team-id", process.env.IOS_TEAM_ID] : []),
  ];
  const capacitor = join(shellDirectory, "node_modules/@capacitor/cli/bin/capacitor");
  const { status } = spawnSync(process.execPath, [capacitor, ...args], {
    cwd: shellDirectory,
    stdio: "inherit",
  });
  if (status !== 0) process.exit(status ?? 1);

  const { directory, extension } = outputs[platform];
  const signed = newest(join(shellDirectory, directory), extension, started);
  if (!signed) fail(`Capacitor finished, but wrote no ${extension} file in ${directory}.`);
  mkdirSync(releaseDirectory, { recursive: true });
  const target = join(
    releaseDirectory,
    `${platform === "ios" ? "App" : "app"}-${version}${extension}`,
  );
  copyFileSync(signed, target);
  console.log(
    `The signed ${platform} release of version ${version}: ${relative(process.cwd(), target)}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  release(process.argv[2]);
}

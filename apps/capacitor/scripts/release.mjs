// Builds the app's store release for one platform, signed:
//
//   node scripts/release.mjs android    (pnpm release android): an App Bundle for Google Play
//   node scripts/release.mjs ios        (pnpm release ios): an IPA for the App Store
//
// It builds the web app for the app and updates the native project first (build.mjs), with the
// version in version.json, then builds the release and signs it with the settings from the
// environment:
// - Android: Gradle builds the App Bundle, and jarsigner signs it with the upload key,
//   ANDROID_KEYSTORE_PATH, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, and ANDROID_KEY_PASSWORD.
//   Not Capacitor's cap build: it signs with SHA-1, which Java now treats as unsigned.
// - iOS: Capacitor builds and exports the IPA, with IOS_TEAM_ID and Xcode's automatic signing;
//   or, as in CI, a certificate and a provisioning profile installed beforehand, named by
//   IOS_SIGNING_CERTIFICATE and IOS_PROVISIONING_PROFILE, which capacitor.config.ts passes on.
// The signed file is copied to release/, which Git ignores.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
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

function fail(message) {
  console.error(message);
  process.exit(1);
}

/** Runs a command, and stops when it fails. */
function run(command, args, options) {
  const { status, error } = spawnSync(command, args, { stdio: "inherit", ...options });
  if (error) fail(`Could not run ${command}: ${error.message}`);
  if (status !== 0) process.exit(status ?? 1);
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

/**
 * Builds the App Bundle with Gradle, and signs it with the upload key into `target`, with SHA-256
 * as Android's documentation does. The passwords reach jarsigner from the environment, never in
 * its arguments.
 */
function releaseAndroid(target) {
  const android = join(shellDirectory, "android");
  // Node.js runs a batch file only through the shell, as one command.
  const windows = process.platform === "win32";
  if (windows) run("gradlew.bat bundleRelease", [], { cwd: android, shell: true });
  else run("./gradlew", ["bundleRelease"], { cwd: android });
  const bundle = join(android, "app/build/outputs/bundle/release/app-release.aab");
  if (!existsSync(bundle)) fail(`Gradle finished, but wrote no ${bundle}.`);
  // The JDK that runs Gradle has jarsigner.
  const javaHome = process.env.JAVA_HOME;
  rmSync(target, { force: true });
  run(javaHome ? join(javaHome, "bin", "jarsigner") : "jarsigner", [
    "-sigalg",
    "SHA256withRSA",
    "-digestalg",
    "SHA-256",
    "-keystore",
    process.env.ANDROID_KEYSTORE_PATH,
    "-storepass:env",
    "ANDROID_KEYSTORE_PASSWORD",
    "-keypass:env",
    "ANDROID_KEY_PASSWORD",
    "-signedjar",
    target,
    bundle,
    process.env.ANDROID_KEY_ALIAS,
  ]);
}

/** Builds and exports the IPA with Capacitor, which Xcode signs, and copies it to `target`. */
function releaseIos(target) {
  const started = Date.now();
  const capacitor = join(shellDirectory, "node_modules/@capacitor/cli/bin/capacitor");
  run(process.execPath, [capacitor, "build", "ios", "--xcode-team-id", process.env.IOS_TEAM_ID], {
    cwd: shellDirectory,
  });
  const archive = newest(join(shellDirectory, "ios/App/output"), ".ipa", started);
  if (!archive) fail("Capacitor finished, but wrote no .ipa file in ios/App/output.");
  copyFileSync(archive, target);
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

  mkdirSync(releaseDirectory, { recursive: true });
  const target = join(
    releaseDirectory,
    platform === "ios" ? `App-${version}.ipa` : `app-${version}.aab`,
  );
  if (platform === "android") releaseAndroid(target);
  else releaseIos(target);
  console.log(
    `The signed ${platform} release of version ${version}: ${relative(process.cwd(), target)}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  release(process.argv[2]);
}

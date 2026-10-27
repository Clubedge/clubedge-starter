// Builds the web app for the mobile app and copies it into the Android and iOS projects:
//
//   node scripts/build.mjs [android] [ios] [--open] [--demo]
//
// The app's pages load from the device, and call the API through the website at WEB_URL. A
// platform named here gets its native project first when it has none (cap add); commit android/
// and ios/ with the rest of the app. Without one, the projects that exist are updated, with the
// version in version.json (version.mjs). --open then opens them in Android Studio or Xcode.
// --demo builds the demo instead: sample data kept on the device, and no server, so no WEB_URL.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { makeIcons } from "./icons.mjs";
import { setUpPush } from "./push.mjs"; // clubedge:only push=native
import { applyVersion } from "./version.mjs";

const shellDirectory = join(import.meta.dirname, "..");
const webDirectory = join(import.meta.dirname, "../../web");
const platforms = ["android", "ios"];

/**
 * The website's origin, from WEB_URL. It must be https: the app sends its session there, and
 * emailed links open it.
 */
export function webOrigin(value) {
  const example = "such as https://app.example.com";
  if (!value) {
    throw new Error(`Set WEB_URL in apps/shell/.env.local to the website's address, ${example}.`);
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`WEB_URL must be the website's address, ${example}, not "${value}".`);
  }
  if (url.protocol !== "https:") {
    throw new Error("WEB_URL must be an https:// address: the app sends its session there.");
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("WEB_URL must be an origin, without credentials, a path, or a query.");
  }
  return url.origin;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

/** Runs a Node.js script, and stops when it fails. */
function run(script, args, options) {
  const { status } = spawnSync(process.execPath, [script, ...args], {
    stdio: "inherit",
    ...options,
  });
  if (status !== 0) process.exit(status ?? 1);
}

export function build(args) {
  const options = args.filter((arg) => arg.startsWith("--"));
  const unknownOption = options.find((option) => !["--open", "--demo"].includes(option));
  if (unknownOption) fail(`Unknown option "${unknownOption}": use --open or --demo.`);
  const named = args.filter((arg) => !options.includes(arg));
  const unknown = named.find((arg) => !platforms.includes(arg));
  if (unknown) fail(`Unknown platform "${unknown}": choose android or ios.`);
  const exists = (platform) => existsSync(join(shellDirectory, platform));
  const targets = named.length > 0 ? named : platforms.filter(exists);
  if (targets.length === 0) {
    fail("The app has no native project yet: run pnpm android or pnpm ios to create one.");
  }
  // A demo answers from memory on the device; the app calls the website otherwise.
  const demo = options.includes("--demo");
  const environment = { VITE_DEMO: String(demo) };
  if (!demo) {
    try {
      environment.VITE_PUBLIC_ORIGIN = webOrigin(process.env.WEB_URL);
    } catch (error) {
      fail(error.message);
    }
  }

  // Vite's "app" mode turns on the app's own code: calls to the website, and sessions kept on the
  // device. This environment wins over apps/web/.env.local, which the build reads too.
  run(
    join(webDirectory, "node_modules/vite/bin/vite.js"),
    ["build", "--mode", "app", "--outDir", "dist-app"],
    { cwd: webDirectory, env: { ...process.env, ...environment } },
  );
  const capacitor = join(shellDirectory, "node_modules/@capacitor/cli/bin/capacitor");
  for (const platform of targets) {
    // cap add creates the native project and copies the build into it; cap sync updates both.
    // A new project gets its icons and splash screens from the logo (icons.mjs).
    const created = !exists(platform);
    run(capacitor, [created ? "add" : "sync", platform], { cwd: shellDirectory });
    if (created) makeIcons(platform);
  }
  // The stores' version and build number, and push notifications, in each native project.
  try {
    applyVersion();
  } catch (error) {
    fail(error.message);
  }
  setUpPush(); // clubedge:only push=native
  if (options.includes("--open")) {
    for (const platform of targets) run(capacitor, ["open", platform], { cwd: shellDirectory });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  build(process.argv.slice(2));
}

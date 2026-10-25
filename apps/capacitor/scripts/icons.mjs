// The app's icons and splash screens, made from assets/logo.svg by Capacitor's asset tool:
//
//   node scripts/icons.mjs [android] [ios]
//
// build.mjs runs it when it creates a native project; run it again (pnpm icons) after changing
// the art. Without a platform, it makes them for the native projects that exist. The tool runs
// through npx at a fixed version, so the project installs nothing for it; it needs the network
// the first time.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const shellDirectory = join(import.meta.dirname, "..");
const logoDirectory = join(import.meta.dirname, "../assets");
const platforms = ["android", "ios"];

// assets/logo.svg is the white mark on a full blue square, so the icon's background is the same
// blue and the icon fills; the splash screens show it as a tile on the app's light and dark
// backgrounds. Match these to your own art.
const iconBackground = "#2563eb";
const splashBackground = "#ffffff";
const splashBackgroundDark = "#151515";

/** The asset tool's arguments for one platform's icons and splash screens. */
export function iconArguments(platform) {
  return [
    "--yes",
    "@capacitor/assets@3.0.5",
    "generate",
    `--${platform}`,
    "--assetPath",
    relative(shellDirectory, logoDirectory),
    "--iconBackgroundColor",
    iconBackground,
    "--iconBackgroundColorDark",
    iconBackground,
    "--splashBackgroundColor",
    splashBackground,
    "--splashBackgroundColorDark",
    splashBackgroundDark,
  ];
}

// Where each native project keeps its app icons.
const iconDirectories = {
  android: ["android/app/src/main/res", (name) => name.startsWith("mipmap")],
  ios: ["ios/App/App/Assets.xcassets", (name) => name === "AppIcon.appiconset"],
};

/** When the platform's icon files last changed, so a run that wrote none shows. */
function iconsChangedAt(platform) {
  const [directory, isIconFolder] = iconDirectories[platform];
  const root = join(shellDirectory, directory);
  if (!existsSync(root)) return 0;
  let latest = 0;
  for (const folder of readdirSync(root).filter(isIconFolder)) {
    for (const file of readdirSync(join(root, folder))) {
      latest = Math.max(latest, statSync(join(root, folder, file)).mtimeMs);
    }
  }
  return latest;
}

/**
 * Makes one platform's icons and splash screens. When it cannot, as offline, the app keeps
 * Capacitor's own: it says so and returns false, rather than stopping a build. The asset tool
 * skips a platform without a native project and still succeeds, so success also means that it
 * wrote the platform's icons.
 */
export function makeIcons(platform) {
  if (!existsSync(join(shellDirectory, platform))) {
    console.error(`The app has no ${platform} project yet: run pnpm ${platform} to create it.`);
    return false;
  }
  const before = iconsChangedAt(platform);
  const windows = process.platform === "win32";
  const { status } = spawnSync(windows ? "npx.cmd" : "npx", iconArguments(platform), {
    cwd: shellDirectory,
    stdio: "inherit",
    shell: windows,
  });
  if (status === 0 && iconsChangedAt(platform) > before) return true;
  console.warn(
    `The ${platform} app keeps Capacitor's default icon for now: run pnpm icons to make it from the logo.`,
  );
  return false;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const named = process.argv.slice(2);
  const unknown = named.find((arg) => !platforms.includes(arg));
  if (unknown) {
    console.error(`Unknown platform "${unknown}": choose android or ios.`);
    process.exit(1);
  }
  const targets =
    named.length > 0
      ? named
      : platforms.filter((platform) => existsSync(join(shellDirectory, platform)));
  if (targets.length === 0) {
    console.error("The app has no native project yet: run pnpm android or pnpm ios to create one.");
    process.exit(1);
  }
  if (!targets.map(makeIcons).every(Boolean)) process.exit(1);
}

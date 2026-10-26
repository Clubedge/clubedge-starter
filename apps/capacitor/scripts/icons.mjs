// The app's icons and splash screens, made from the art in assets/ by Capacitor's asset tool:
//
//   node scripts/icons.mjs [android] [ios]
//
// build.mjs runs it when it creates a native project; run it again (pnpm icons) after changing
// the art. Without a platform, it makes them for the native projects that exist. The tool runs
// through npx at a fixed version, so the project installs nothing for it; it needs the network
// the first time.
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const shellDirectory = join(import.meta.dirname, "..");
const logoDirectory = join(import.meta.dirname, "../assets");
const platforms = ["android", "ios"];

// The art, in assets/:
// - logo.svg, the app's icon: the white mark on a full blue square, so the icon's background is
//   the same blue and the icon fills.
// - splash.svg and splash-dark.svg, iOS's splash screens: the blue mark in the middle of the
//   app's light and dark backgrounds.
// - splash-icon.png, the blue mark alone, which Android draws on those backgrounds itself
//   (makeAndroidSplash).
// Match these colors to your own art.
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
  ];
}

/** Android's splash screen resources, by path in the project's res/ folder. */
function androidSplashResources() {
  const color = (value) =>
    `<?xml version="1.0" encoding="utf-8"?>
<!-- Made by scripts/icons.mjs. -->
<resources>
    <color name="splash_screen_background">${value}</color>
</resources>
`;
  return {
    // Android 12 and later show the splash icon as a 288dp square, through a circle 192dp
    // across: at 128dp in its middle, even the mark's corners stay inside it.
    "drawable/splash_screen_icon.xml": `<?xml version="1.0" encoding="utf-8"?>
<!-- The splash screen's mark, 128dp in the middle of Android's 288dp splash icon. Made by
     scripts/icons.mjs from assets/splash-icon.png. -->
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:width="288dp" android:height="288dp">
        <shape android:shape="rectangle">
            <solid android:color="@android:color/transparent" />
        </shape>
    </item>
    <item
        android:width="128dp"
        android:height="128dp"
        android:drawable="@drawable/splash_icon"
        android:gravity="center" />
</layer-list>
`,
    // The launch screen's background: the same mark in the same place, so nothing moves when
    // Android's splash screen gives way to it, and no screen's shape stretches it.
    "drawable/splash_screen.xml": `<?xml version="1.0" encoding="utf-8"?>
<!-- Made by scripts/icons.mjs. -->
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:drawable="@color/splash_screen_background" />
    <item android:drawable="@drawable/splash_screen_icon" android:gravity="center" />
</layer-list>
`,
    "values/splash_screen.xml": color(splashBackground.toUpperCase()),
    "values-night/splash_screen.xml": color(splashBackgroundDark.toUpperCase()),
  };
}

// Capacitor's launch theme shows a picture of the whole screen, which Android stretches to the
// screen's shape; it becomes the mark above, in the middle of the background.
const capacitorLaunchBackground = '<item name="android:background">@drawable/splash</item>';
const launchSplash = [
  '<item name="android:background">@drawable/splash_screen</item>',
  '<item name="windowSplashScreenBackground">@color/splash_screen_background</item>',
  '<item name="windowSplashScreenAnimatedIcon">@drawable/splash_screen_icon</item>',
];

/**
 * Makes Android's splash screen from assets/splash-icon.png: the mark in the middle of the
 * background, drawn by Android itself. Returns false when the app's launch theme is no longer
 * Capacitor's own, which it then leaves as it is.
 */
export function makeAndroidSplash(androidDirectory = join(shellDirectory, "android")) {
  const resources = join(androidDirectory, "app/src/main/res");
  const write = (path, contents) => {
    mkdirSync(dirname(join(resources, path)), { recursive: true });
    writeFileSync(join(resources, path), contents);
  };
  mkdirSync(join(resources, "drawable-nodpi"), { recursive: true });
  copyFileSync(
    join(logoDirectory, "splash-icon.png"),
    join(resources, "drawable-nodpi/splash_icon.png"),
  );
  for (const [path, contents] of Object.entries(androidSplashResources())) write(path, contents);

  const stylesPath = join(resources, "values/styles.xml");
  const styles = readFileSync(stylesPath, "utf8");
  if (styles.includes("@drawable/splash_screen<")) return true;
  const at = styles.indexOf(capacitorLaunchBackground);
  if (at === -1) {
    console.warn(
      "The app's launch theme (res/values/styles.xml) is your own, so its splash screen stays as it is.",
    );
    return false;
  }
  const newline = styles.includes("\r\n") ? "\r\n" : "\n";
  const indent = styles.slice(styles.lastIndexOf("\n", at) + 1, at);
  writeFileSync(
    stylesPath,
    styles.replace(capacitorLaunchBackground, launchSplash.join(`${newline}${indent}`)),
  );
  return true;
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
 * Makes one platform's icons and splash screens. When the asset tool cannot, as offline, the app
 * keeps Capacitor's own icons: it says so and returns false, rather than stopping a build.
 * Android's splash screen needs no network, so it is made either way. The asset tool skips a
 * platform without a native project and still succeeds, so success also means that it wrote the
 * platform's icons.
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
  if (platform === "android") makeAndroidSplash();
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

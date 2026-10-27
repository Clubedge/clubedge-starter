import type { ConfigContext, ExpoConfig } from "expo/config";
import site from "./src/config/site.json";

// The app's id on Android and iOS, made from the project's name until you set your own. It
// becomes permanent once a store lists the app: set a reverse-domain id you own, such as
// com.yourcompany.app, before the first release build.
const appId = `com.example.${site.serviceId.replace(/[^a-z0-9]/gi, "").replace(/^[0-9]+/, "") || "app"}`;

// The app's own address scheme, such as my-product://. Better Auth, on the server, trusts the
// scheme it derives from its own site config the same way, so keep the two in step.
const scheme =
  site.serviceId
    .toLowerCase()
    .replace(/[^a-z0-9+.-]/g, "")
    .replace(/^[^a-z]+/, "") || "app";

/**
 * The build number both stores order builds by, from the version: 1.4.2 is build 1004002. A new
 * version is a new build, so a release only changes the version (pnpm set-version), which the
 * update policy compares too (APP_MINIMUM_VERSION, APP_LATEST_VERSION).
 */
export function buildNumber(version: string): number {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  const [major, minor, patch] = (match?.slice(1) ?? []).map(Number);
  if (major === undefined || minor === undefined || patch === undefined) {
    throw new Error(
      `app.json's version must be major.minor.patch, such as 1.4.2, not "${version}".`,
    );
  }
  if (major > 2_099 || minor > 999 || patch > 999) {
    throw new Error(`app.json's version ${version} is too large for a build number.`);
  }
  return major * 1_000_000 + minor * 1_000 + patch;
}

// Firebase's Android settings, which FCM needs to deliver notifications: the path to // clubedge:only push!=none
// google-services.json, from .env.local or an EAS file variable of the same name. // clubedge:only push!=none
const googleServicesFile = process.env.GOOGLE_SERVICES_JSON || undefined; // clubedge:only push!=none

// app.json holds what the Expo tools write: the version (pnpm set-version), and the EAS project
// id that `eas init` links the app to.
export default ({ config }: ConfigContext): ExpoConfig => {
  // The version the stores show, which the update notice compares with APP_MINIMUM_VERSION and
  // APP_LATEST_VERSION: raise it with each release.
  const version = config.version ?? "1.0.0";
  const projectId: unknown = config.extra?.eas?.projectId; // clubedge:only ota=eas
  return {
    ...config,
    name: site.name,
    slug: site.serviceId,
    scheme,
    version,
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "automatic",
    platforms: ["ios", "android"],
    ios: {
      bundleIdentifier: appId,
      buildNumber: String(buildNumber(version)),
      supportsTablet: true,
    },
    android: {
      package: appId,
      versionCode: buildNumber(version),
      adaptiveIcon: { foregroundImage: "./assets/adaptive-icon.png", backgroundColor: "#2563EB" },
      googleServicesFile, // clubedge:only push!=none
    },
    // clubedge:if ota=eas
    // Over-the-air updates reach only builds of their version, so a change to native code, which
    // needs a store release, comes with a new version.
    runtimeVersion: { policy: "appVersion" },
    ...(typeof projectId === "string"
      ? { updates: { url: `https://u.expo.dev/${projectId}` } }
      : {}),
    // clubedge:end
    plugins: [
      "expo-router",
      "expo-font",
      ["expo-notifications", { color: "#2563EB" }], // clubedge:only push!=none
      [
        "expo-splash-screen",
        {
          image: "./assets/splash-icon.png",
          // Android 12 and later show the splash image through a circle 192dp across: at 128dp,
          // even the mark's corners stay inside it.
          imageWidth: 128,
          resizeMode: "contain",
          backgroundColor: "#FFFFFF",
          dark: { image: "./assets/splash-icon.png", backgroundColor: "#151515" },
        },
      ],
    ],
  };
};

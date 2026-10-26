import type { ExpoConfig } from "expo/config";
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

const config: ExpoConfig = {
  name: site.name,
  slug: site.serviceId,
  scheme,
  // The version the stores show and the update notice compares with APP_MINIMUM_VERSION and
  // APP_LATEST_VERSION: raise it with each release.
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  platforms: ["ios", "android"],
  ios: { bundleIdentifier: appId, supportsTablet: true },
  android: {
    package: appId,
    adaptiveIcon: { foregroundImage: "./assets/adaptive-icon.png", backgroundColor: "#2563EB" },
  },
  plugins: [
    "expo-router",
    [
      "expo-splash-screen",
      {
        image: "./assets/splash-icon.png",
        imageWidth: 160,
        resizeMode: "contain",
        backgroundColor: "#FFFFFF",
        dark: { image: "./assets/splash-icon.png", backgroundColor: "#151515" },
      },
    ],
  ],
};

export default config;

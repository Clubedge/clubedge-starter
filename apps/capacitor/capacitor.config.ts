import type { CapacitorConfig } from "@capacitor/cli";
import site from "../web/src/config/site.json" with { type: "json" };

// The app's id on Android and iOS, made from the project's name until you set your own. It
// becomes permanent once Capacitor creates the native projects and a store lists the app: set a
// reverse-domain id you own, such as com.yourcompany.app, before the first Android or iOS build.
const appId = `com.example.${site.serviceId.replace(/[^a-z0-9]/gi, "").replace(/^[0-9]+/, "") || "app"}`;

const config: CapacitorConfig = {
  appId,
  appName: site.name,
  // The web app's build for the app, which pnpm android, pnpm ios, and pnpm sync make.
  webDir: "../web/dist-app",
  server: {
    // The app's pages load from https://localhost on Android and capacitor://localhost on iOS:
    // the origins the website's server takes the app's requests from (MOBILE_ORIGINS).
    androidScheme: "https",
  },
  // How pnpm release signs the iOS build (scripts/release.mjs), from the environment, never from
  // this file: Xcode's automatic signing, or, with a provisioning profile named, manual signing as
  // in CI. The script signs Android's App Bundle itself.
  ios: {
    buildOptions: process.env.IOS_PROVISIONING_PROFILE
      ? {
          signingStyle: "manual",
          signingCertificate: process.env.IOS_SIGNING_CERTIFICATE || "Apple Distribution",
          provisioningProfile: process.env.IOS_PROVISIONING_PROFILE,
        }
      : { signingStyle: "automatic" },
  },
  plugins: {
    // Pages draw under the system bars (viewport-fit=cover in index.html) and keep clear of them
    // with CSS env(safe-area-inset-*). On older Android WebViews, Capacitor insets the WebView.
    SystemBars: { insetsHandling: "native", initialViewportFitValueHint: "cover" },
  },
};

export default config;

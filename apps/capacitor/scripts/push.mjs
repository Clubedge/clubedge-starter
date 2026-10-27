// Push notifications in the native projects, which build.mjs sets up at each build:
// - Android: FCM needs Firebase's google-services.json, which this copies from apps/shell into
//   android/app, where the project's build applies Google's services plugin when it is there.
// - iOS: the app delegate hands the APNs device token to Capacitor's push plugin, and the app's
//   entitlements turn on push notifications. Xcode marks them for production when it exports a
//   build for the stores.
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const shellDirectory = join(import.meta.dirname, "..");

// What Capacitor's push plugin asks of the app delegate: APNs' answer, passed on to the plugin.
const delegateMethods = `
    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        NotificationCenter.default.post(
            name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        NotificationCenter.default.post(
            name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }
`;

/** The app delegate, with the methods that pass APNs' answer to the push plugin. */
export function delegateWithPush(text) {
  if (text.includes("didRegisterForRemoteNotificationsWithDeviceToken")) return text;
  // The class's closing brace is the file's last one.
  const end = text.lastIndexOf("}");
  if (end === -1) throw new Error("ios/App/App/AppDelegate.swift has no class to add to.");
  return `${text.slice(0, end).trimEnd()}\n${delegateMethods}}${text.slice(end + 1)}`;
}

const entitlements = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>aps-environment</key>
\t<string>development</string>
</dict>
</plist>
`;

/** The Xcode project, with the app's entitlements in each of its configurations. */
export function projectWithEntitlements(text) {
  if (text.includes("CODE_SIGN_ENTITLEMENTS")) return text;
  return text.replace(
    /^([ \t]*)INFOPLIST_FILE = App\/Info\.plist;/gm,
    "$1CODE_SIGN_ENTITLEMENTS = App/App.entitlements;\n$1INFOPLIST_FILE = App/Info.plist;",
  );
}

/** Writes `file` when `edit` changes it. */
function update(file, edit) {
  const text = readFileSync(file, "utf8");
  const updated = edit(text);
  if (updated !== text) writeFileSync(file, updated);
}

/** Sets push notifications up in the native projects that exist. */
export function setUpPush() {
  const services = join(shellDirectory, "google-services.json");
  const androidApp = join(shellDirectory, "android/app");
  if (existsSync(services) && existsSync(androidApp)) {
    copyFileSync(services, join(androidApp, "google-services.json"));
  }
  const iosApp = join(shellDirectory, "ios/App/App");
  if (!existsSync(join(iosApp, "AppDelegate.swift"))) return;
  update(join(iosApp, "AppDelegate.swift"), delegateWithPush);
  if (!existsSync(join(iosApp, "App.entitlements"))) {
    writeFileSync(join(iosApp, "App.entitlements"), entitlements);
  }
  update(join(shellDirectory, "ios/App/App.xcodeproj/project.pbxproj"), projectWithEntitlements);
}

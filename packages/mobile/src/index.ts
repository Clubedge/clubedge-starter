// The mobile app's native helpers. The web app loads this package only in its build for the app
// (Vite's "app" mode), through a dynamic import, so the website never bundles Capacitor.
import { App } from "@capacitor/app";
import { Preferences } from "@capacitor/preferences";

/** Strings kept on the device, private to the app, such as its session. */
export interface DeviceStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/**
 * The app's own storage: SharedPreferences on Android and UserDefaults on iOS. It lasts until
 * the app is uninstalled, unlike the WebView's localStorage, which the system may clear to free
 * space.
 */
export const storage: DeviceStorage = {
  async get(key) {
    return (await Preferences.get({ key })).value;
  },
  async set(key, value) {
    await Preferences.set({ key, value });
  },
  async remove(key) {
    await Preferences.remove({ key });
  },
};

/** The installed app's version, as its store lists it, such as "1.4.0". */
export async function appVersion(): Promise<string> {
  return (await App.getInfo()).version;
}

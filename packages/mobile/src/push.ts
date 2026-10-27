// Push notifications in the mobile app, through Capacitor's plugin: the system's permission, the
// device's token (FCM's on Android, APNs' on iOS), which the API saves for the signed-in user, and
// the page a tapped notification opens. Whether they are on is kept on the device, with the token,
// so each start sends the token again: a push service can change it.
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import type { ApiClient } from "@clubedge/contract";
import { storage } from "./index";

const tokenKey = "push.token";

/** Why notifications could not be turned on or tested, as the settings page says it. */
export class PushError extends Error {
  override name = "PushError";
}

/** The device's token, which the plugin hands over in an event once it registers. */
function registerDevice(): Promise<string> {
  return new Promise((resolve, reject) => {
    const handles = Promise.all([
      PushNotifications.addListener("registration", ({ value }) => {
        void stop();
        resolve(value);
      }),
      PushNotifications.addListener("registrationError", ({ error }) => {
        void stop();
        reject(new PushError(`This device has no push token: ${error}`));
      }),
    ]);
    const stop = async () => {
      for (const handle of await handles) await handle.remove();
    };
    void handles.then(() => PushNotifications.register()).catch(reject);
  });
}

/** Whether notifications are on for this device. */
export async function isPushEnabled(): Promise<boolean> {
  return (await storage.get(tokenKey)) !== null;
}

/** Saves this device's token with the API, for the signed-in user. */
async function saveDevice(api: ApiClient): Promise<void> {
  const token = await registerDevice();
  const platform = Capacitor.getPlatform() === "ios" ? "ios" : "android";
  const service = platform === "ios" ? "apns" : "fcm";
  const { response } = await api.POST("/api/push/devices", { body: { token, service, platform } });
  if (!response.ok) {
    throw new PushError(
      response.status === 503
        ? "Push notifications are not set up on the server yet."
        : "The server did not save this device. Try again.",
    );
  }
  await storage.set(tokenKey, token);
}

/** Asks the system's permission, then saves this device's token with the API. */
export async function enablePush(api: ApiClient): Promise<void> {
  let { receive } = await PushNotifications.checkPermissions();
  if (receive === "prompt" || receive === "prompt-with-rationale") {
    ({ receive } = await PushNotifications.requestPermissions());
  }
  if (receive !== "granted") {
    throw new PushError(
      "Notifications are off for this app: turn them on in the phone's settings.",
    );
  }
  await saveDevice(api);
}

/**
 * Forgets this device's token, on the server and here, so it gets no more notifications. The
 * token is what the device proves itself with, so this works once the session has ended too.
 */
export async function disablePush(api: ApiClient): Promise<void> {
  const token = await storage.get(tokenKey);
  await storage.remove(tokenKey);
  if (token) await api.POST("/api/push/devices/remove", { body: { token } }).catch(() => {});
}

/** Sends a test notification to each of the user's devices; resolves how many the service took. */
export async function sendTestPush(api: ApiClient): Promise<number> {
  const { data, response } = await api.POST("/api/push/test", { body: {} });
  if (response.status === 429) {
    throw new PushError("Too many test notifications. Try again in a minute.");
  }
  if (!data) throw new PushError("The server could not send a notification right now.");
  return data.sent;
}

/**
 * The page a notification opens: its data's `url`, which the API also sends inside `body` where
 * a service hands the data on as JSON. Only the app's own pages: a path, never another site.
 */
export function notificationPath(data: unknown): string | null {
  const read = (value: unknown): string | null => {
    if (typeof value === "string") {
      try {
        return read(JSON.parse(value));
      } catch {
        return null;
      }
    }
    if (typeof value !== "object" || value === null) return null;
    const record = value as Record<string, unknown>;
    if (typeof record.url === "string") return record.url;
    return record.body === undefined ? null : read(record.body);
  };
  const url = read(data);
  return url?.startsWith("/") && !url.startsWith("//") ? url : null;
}

/**
 * At the app's start: opens the page a tapped notification names, and sends this device's token
 * again while notifications are on, or forgets it if the phone's settings took the permission.
 */
export async function startPush(api: ApiClient, open: (path: string) => void): Promise<void> {
  await PushNotifications.addListener("pushNotificationActionPerformed", ({ notification }) => {
    const path = notificationPath(notification.data);
    if (path) open(path);
  });
  if (!(await isPushEnabled())) return;
  const { receive } = await PushNotifications.checkPermissions();
  await (receive === "granted" ? saveDevice(api) : disablePush(api)).catch(() => {});
}

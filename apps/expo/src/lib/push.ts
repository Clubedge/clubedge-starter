// Push notifications on this device: the system's permission, the device's push token, which the
// API saves for the signed-in user, and the screen a tapped notification opens. Whether they are
// on is kept on the device, with the token, so each start sends the token again: a push service
// can change it.
import * as Notifications from "expo-notifications";
import { router, type Href } from "expo-router";
import deviceStorage from "expo-sqlite/kv-store";
import { useEffect, useSyncExternalStore } from "react";
import { Platform } from "react-native";
import { api } from "@/lib/api";
import { pushToken } from "@/lib/push-token";

const tokenKey = "push.token";

// While the app is open, a notification shows as a banner, with its sound.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** The token the API saved for this device, or null while notifications are off. */
let savedToken: string | null = deviceStorage.getItemSync(tokenKey);
const listeners = new Set<() => void>();

function setSavedToken(token: string | null) {
  savedToken = token;
  if (token) deviceStorage.setItemSync(tokenKey, token);
  else deviceStorage.removeItemSync(tokenKey);
  for (const listener of listeners) listener();
}

/** Whether notifications are on for this device, following changes. */
export function usePushEnabled(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => savedToken !== null,
  );
}

/** Why notifications could not be turned on or tested, as the settings screen says it. */
export class PushError extends Error {
  override name = "PushError";
}

/** Sends this device's token to the API, for the signed-in user. */
async function register() {
  let device;
  try {
    device = await pushToken();
  } catch (error) {
    throw new PushError(error instanceof Error ? error.message : "This device has no push token.");
  }
  const platform = Platform.OS === "ios" ? "ios" : "android";
  const { response } = await api.POST("/api/push/devices", { body: { ...device, platform } });
  if (!response.ok) {
    throw new PushError(
      response.status === 503
        ? "Push notifications are not set up on the server yet."
        : "The server did not save this device. Try again.",
    );
  }
  setSavedToken(device.token);
}

/** Asks the system's permission, then saves this device's token with the API. */
export async function enablePush(): Promise<void> {
  if (Platform.OS === "android") {
    // Android shows notifications in a channel, which must exist before the permission prompt.
    await Notifications.setNotificationChannelAsync("default", {
      name: "Notifications",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  const { granted } = current.granted ? current : await Notifications.requestPermissionsAsync();
  if (!granted) {
    throw new PushError(
      "Notifications are off for this app: turn them on in the phone's settings.",
    );
  }
  await register();
}

/**
 * Forgets this device's token, on the server and here, so it gets no more notifications. The
 * token is what the device proves itself with, so this works once the session has ended too.
 */
export async function disablePush(): Promise<void> {
  const token = savedToken;
  setSavedToken(null);
  if (token) await api.POST("/api/push/devices/remove", { body: { token } }).catch(() => {});
}

/** Sends a test notification to each of the user's devices; resolves how many the service took. */
export async function sendTestPush(): Promise<number> {
  const { data, response } = await api.POST("/api/push/test", { body: {} });
  if (response.status === 429) {
    throw new PushError("Too many test notifications. Try again in a minute.");
  }
  if (!data) throw new PushError("The server could not send a notification right now.");
  return data.sent;
}

/**
 * The screen a notification opens: its data's `url`, which the API also sends inside `body`
 * where a service hands the data on as JSON. Only the app's own screens: a path, never a site.
 */
export function notificationScreen(data: unknown): string | null {
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

// The notifications already opened: the one that started the app stays the last one after that.
const opened = new Set<string>();

/**
 * For the signed-in screens: sends this device's token again while notifications are on, as a
 * push service can change it, and opens the screen a tapped notification names.
 */
export function usePushNotifications() {
  useEffect(() => {
    if (savedToken) {
      // Without the permission, which the phone's settings can take back, they are off.
      void Notifications.getPermissionsAsync()
        .then(({ granted }) => (granted ? register() : disablePush()))
        .catch(() => {});
    }
    const open = (response: Notifications.NotificationResponse) => {
      const { identifier, content } = response.notification.request;
      if (opened.has(identifier)) return;
      opened.add(identifier);
      const screen = notificationScreen(content.data);
      if (screen) router.push(screen as Href);
    };
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) open(response);
    });
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => subscription.remove();
  }, []);
}

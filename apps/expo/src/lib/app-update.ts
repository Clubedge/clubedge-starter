// The app's side of updates (packages/contract, app-update.ts): its version and platform, which
// each request to the API carries, and where it remembers a block for its next start offline.
import {
  appPlatform,
  appVersionMiddleware,
  type ApiClient,
  type UpdateStorage,
} from "@clubedge/contract";
import * as Application from "expo-application";
import deviceStorage from "expo-sqlite/kv-store";
import { Platform } from "react-native";

/** The version the stores show, from app.config.ts: what the API's versions are compared with. */
export const installedVersion = Application.nativeApplicationVersion ?? "";

/** The app's own storage on the device, which keeps what the update checks remember. */
export const updateStorage: UpdateStorage = {
  get: (key) => deviceStorage.getItem(key),
  set: (key, value) => deviceStorage.setItem(key, value),
  remove: async (key) => {
    await deviceStorage.removeItem(key);
  },
};

const refusedListeners = new Set<() => void>();

/** Calls `listener` whenever the API refuses this version of the app; returns its removal. */
export function onUpdateRequired(listener: () => void) {
  refusedListeners.add(listener);
  return () => {
    refusedListeners.delete(listener);
  };
}

/**
 * Has each of `api`'s requests say which version and platform the app is, so the API can refuse
 * one it no longer serves, with 426 update_required: the update gate then shows its screen.
 */
export function sendAppVersion(api: ApiClient) {
  api.use(
    appVersionMiddleware({
      version: () => installedVersion,
      platform: appPlatform(Platform.OS),
      onRefused: () => {
        for (const listener of refusedListeners) listener();
      },
    }),
  );
}

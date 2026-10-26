// The app's side of updates (packages/contract, app-update.ts): its version and platform, which
// each request to the API carries, where it remembers a block for its next start offline, and
// the checks that the update gate and the dashboard draw.
import { appPlatform, appVersionMiddleware, createUpdateChecks } from "@clubedge/contract";
import * as Application from "expo-application";
import deviceStorage from "expo-sqlite/kv-store";
import { Platform } from "react-native";
import { api } from "@/lib/api";

/** The version the stores show, from app.config.ts: what the API's versions are compared with. */
export const installedVersion = Application.nativeApplicationVersion ?? "";

/** What the app shows for its updates, and the events that change it (UpdateGate starts them). */
export const updates = createUpdateChecks({
  installed: installedVersion,
  versions: async () => (await api.GET("/api/app-version")).data ?? null,
  // The app's own storage on the device.
  storage: {
    get: (key) => deviceStorage.getItem(key),
    set: (key, value) => deviceStorage.setItem(key, value),
    remove: async (key) => {
      await deviceStorage.removeItem(key);
    },
  },
});

// Each request to the API says which version and platform the app is, so the API can refuse one
// it no longer serves, with 426 update_required, which blocks the app at once. The root layout
// loads this file, through the update gate, before any screen calls the API.
api.use(
  appVersionMiddleware({
    version: () => installedVersion,
    platform: appPlatform(Platform.OS),
    onRefused: updates.refused,
  }),
);

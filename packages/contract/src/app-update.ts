// What an installed app does with the versions the API serves (app-version.ts), the same in the
// native app (apps/mobile) and the mobile app (packages/mobile). Each request says which version
// and platform the app is. The app checks when it starts, when it comes back to the foreground
// (at most every UPDATE_CHECK_INTERVAL), and when the API refuses it. It remembers a block, so
// the block holds when it next starts offline. A notice its user dismissed stays dismissed until
// there is news.
import type { Middleware } from "openapi-fetch";
import {
  APP_PLATFORM_HEADER,
  APP_VERSION_HEADER,
  updateStatus,
  type AppPlatform,
  type UpdateStatus,
} from "./app-version";
import type { components } from "./schema";

type AppVersion = components["schemas"]["AppVersion"];

/** How often a return to the app checks again, at most. */
export const UPDATE_CHECK_INTERVAL = 15 * 60 * 1000;

/** Strings the app keeps on the device, private to it. */
export interface UpdateStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/**
 * What the app shows, with the versions it comes from: null for a remembered block, until the
 * API answers again.
 */
export interface AppUpdate {
  status: UpdateStatus;
  versions: AppVersion | null;
}

/** The installed version the API last required to update. */
const REQUIRED_KEY = "app-update.required";
/** The notice its user last dismissed (noticeKey). */
const DISMISSED_KEY = "app-update.dismissed";

/**
 * Has each request say which version and platform the app is, and calls `onRefused` when the API
 * answers 426 update_required, so the app shows its update screen whatever it asked.
 */
export function appVersionMiddleware(app: {
  version: () => string | Promise<string>;
  platform: AppPlatform | null;
  onRefused: () => void;
}): Middleware {
  return {
    async onRequest({ request }) {
      const version = await app.version();
      if (version) request.headers.set(APP_VERSION_HEADER, version);
      if (app.platform) request.headers.set(APP_PLATFORM_HEADER, app.platform);
      return request;
    },
    onResponse({ response }) {
      if (response.status === 426) app.onRefused();
      return response;
    },
  };
}

/**
 * Asks the API which versions it serves, and what they call for. A block is remembered, so it
 * holds when the app next starts offline, until the app is updated. Null when the API can't be
 * reached or read: what the app shows stays as it is.
 */
export async function checkForUpdate(
  installed: string,
  versions: () => Promise<AppVersion | null>,
  storage: UpdateStorage,
): Promise<AppUpdate | null> {
  const served = await versions().catch(() => null);
  const status = updateStatus(installed, served);
  if (!status) return null;
  if (status === "required") await storage.set(REQUIRED_KEY, installed);
  else await storage.remove(REQUIRED_KEY);
  return { status, versions: served };
}

/** The block the API last answered this installed version, if any, for the app to show first. */
export async function rememberedUpdate(
  installed: string,
  storage: UpdateStorage,
): Promise<AppUpdate | null> {
  if (!installed || (await storage.get(REQUIRED_KEY)) !== installed) return null;
  return { status: "required", versions: null };
}

/**
 * The notice the user can dismiss, as the key the app remembers it by. An available update stays
 * dismissed until a newer version is out. A warning before a minimum's date stays dismissed for
 * the rest of the day, so it comes back each day until then. Null for a block, which can't be.
 */
export function noticeKey(update: AppUpdate, now = new Date()): string | null {
  const { status, versions } = update;
  if (status === "available") return `available ${versions?.latestVersion ?? ""}`;
  if (status !== "upcoming") return null;
  return `upcoming ${versions?.nextMinimumVersion ?? ""} ${now.toISOString().slice(0, 10)}`;
}

/** Whether the user dismissed this notice. */
export async function isDismissed(update: AppUpdate, storage: UpdateStorage, now = new Date()) {
  const key = noticeKey(update, now);
  return key !== null && (await storage.get(DISMISSED_KEY)) === key;
}

/** Remembers that the user dismissed this notice. */
export async function dismiss(update: AppUpdate, storage: UpdateStorage, now = new Date()) {
  const key = noticeKey(update, now);
  if (key) await storage.set(DISMISSED_KEY, key);
}

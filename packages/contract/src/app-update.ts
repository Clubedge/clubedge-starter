// What an installed app does with the versions the API serves (app-version.ts), the same in the
// native app (apps/mobile) and the mobile app (packages/mobile): createUpdateChecks keeps what the
// app shows, and both apps only draw it. Each request says which version and platform the app
// is. The app checks when it starts, when it comes back to the foreground (at most every
// UPDATE_CHECK_INTERVAL), and when the API refuses it. It remembers a block, so the block holds
// when it next starts offline. A notice its user dismissed stays dismissed until there is news.
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
/**
 * The notice of each kind its user last dismissed (noticeKey), as app-update.dismissed.upcoming,
 * so dismissing one kind never brings back another.
 */
const DISMISSED_KEY = "app-update.dismissed";

/**
 * Runs what the app can do without, such as keeping a value on the device: when it fails, the
 * result is undefined, and the app carries on.
 */
async function bestEffort<T>(operation: () => Promise<T>): Promise<T | undefined> {
  try {
    return await operation();
  } catch {
    return undefined;
  }
}

/**
 * Has each request say which version and platform the app is, and calls `onRefused` when the API
 * answers 426 update_required, so the app shows its update screen whatever it asked. A version
 * the device can't give leaves the request without it, rather than failing it.
 */
export function appVersionMiddleware(app: {
  version: () => string | Promise<string>;
  platform: AppPlatform | null;
  onRefused: () => void;
}): Middleware {
  return {
    async onRequest({ request }) {
      const version = await bestEffort(async () => app.version());
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
  const served = (await bestEffort(versions)) ?? null;
  const status = updateStatus(installed, served);
  if (!status) return null;
  await bestEffort(() =>
    status === "required" ? storage.set(REQUIRED_KEY, installed) : storage.remove(REQUIRED_KEY),
  );
  return { status, versions: served };
}

/** The block the API last answered this installed version, if any, for the app to show first. */
export async function rememberedUpdate(
  installed: string,
  storage: UpdateStorage,
): Promise<AppUpdate | null> {
  if (!installed || (await bestEffort(() => storage.get(REQUIRED_KEY))) !== installed) return null;
  return { status: "required", versions: null };
}

/**
 * The notice the user can dismiss, as the key the app remembers it by. An available update stays
 * dismissed until a newer version is out. A warning before a minimum's date stays dismissed for
 * the rest of the user's day, so it comes back each day until then. Null for a block, which can't
 * be.
 */
export function noticeKey(update: AppUpdate, now = new Date()): string | null {
  const { status, versions } = update;
  if (status === "available") return `available ${versions?.latestVersion ?? ""}`;
  if (status !== "upcoming") return null;
  const day = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map((part) => String(part).padStart(2, "0"))
    .join("-");
  return `upcoming ${versions?.nextMinimumVersion ?? ""} ${day}`;
}

const dismissedKey = (update: AppUpdate) => `${DISMISSED_KEY}.${update.status}`;

/** Whether the user dismissed this notice. */
export async function isDismissed(update: AppUpdate, storage: UpdateStorage, now = new Date()) {
  const key = noticeKey(update, now);
  return key !== null && (await bestEffort(() => storage.get(dismissedKey(update)))) === key;
}

/** Remembers that the user dismissed this notice. */
export async function dismiss(update: AppUpdate, storage: UpdateStorage, now = new Date()) {
  const key = noticeKey(update, now);
  if (key) await bestEffort(() => storage.set(dismissedKey(update), key));
}

/** What an app shows for its updates, and the events that change it (createUpdateChecks). */
export interface UpdateChecks {
  /** What the app shows: null until known, and while its user has dismissed it. */
  current(): AppUpdate | null;
  /** Calls `listener` whenever that changes; returns its removal. */
  subscribe(listener: () => void): () => void;
  /** Shows the block remembered from an earlier run, then checks: when the app starts. */
  start(): void;
  /** Checks again, at most every UPDATE_CHECK_INTERVAL: when the app returns to the foreground. */
  resume(): void;
  /** The API refused this version (426): blocks the app, remembers that, and checks. */
  refused(): void;
  /** The user's "Not now": hides the notice until there is news (noticeKey). */
  notNow(): void;
}

/**
 * The update checks of a running app, which both apps only draw. Checks and refusals take turns
 * in the order they start, and one's answer shows only while nothing newer has shown, so a slow
 * answer never undoes a block. A failure, of the API or of the device's storage, changes nothing.
 */
export function createUpdateChecks(app: {
  /** The installed version, such as 1.4.0, or "" when the device can't say. */
  installed: string | Promise<string>;
  /** The versions the API serves (GET /api/app-version), or null. */
  versions: () => Promise<AppVersion | null>;
  storage: UpdateStorage;
}): UpdateChecks {
  const installed = Promise.resolve(app.installed).catch(() => "");
  const listeners = new Set<() => void>();
  let shown: AppUpdate | null = null;
  /** The versions the API last served, for the update link of a block. */
  let served: AppVersion | null = null;
  let turns = 0;
  /** The turn of what the app shows. */
  let shownTurn = 0;
  let checkedAt = Number.NEGATIVE_INFINITY;
  let started = false;

  const set = (update: AppUpdate | null) => {
    shown = update;
    for (const listener of listeners) listener();
  };
  const show = (turn: number, update: AppUpdate | null) => {
    if (turn < shownTurn) return;
    shownTurn = turn;
    set(update);
  };

  const check = async () => {
    const turn = ++turns;
    checkedAt = Date.now();
    const update = await checkForUpdate(await installed, app.versions, app.storage);
    if (!update) return;
    served = update.versions;
    show(turn, (await isDismissed(update, app.storage)) ? null : update);
  };

  return {
    current: () => shown,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start() {
      if (started) return;
      started = true;
      const turn = ++turns;
      void (async () => {
        const remembered = await rememberedUpdate(await installed, app.storage);
        if (remembered) show(turn, remembered);
        await check();
      })();
    },
    resume() {
      if (Date.now() - checkedAt >= UPDATE_CHECK_INTERVAL) void check();
    },
    refused() {
      // Each of a blocked app's requests can be refused: once blocked, they are no news.
      if (shown?.status === "required") return;
      show(++turns, { status: "required", versions: served });
      void (async () => {
        const version = await installed;
        if (version) await bestEffort(() => app.storage.set(REQUIRED_KEY, version));
        await check();
      })();
    },
    notNow() {
      const update = shown;
      if (!update || noticeKey(update) === null) return;
      // Takes no turn: a check under way still shows its answer, such as a block.
      set(null);
      void dismiss(update, app.storage);
    },
  };
}

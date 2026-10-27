import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiClient } from "@clubedge/contract";
import {
  disablePush,
  enablePush,
  isPushEnabled,
  notificationPath,
  PushError,
  startPush,
} from "./push";

// Capacitor's plugins call into the native app; these stand-ins answer as its Android code does:
// Preferences keeps strings by key, and PushNotifications asks for the permission, then hands the
// device's token to its "registration" listeners.
const device = vi.hoisted(() => ({
  preferences: new Map<string, string>(),
  permission: "prompt" as string,
  answer: "granted" as string,
  listeners: new Map<string, (event: unknown) => void>(),
  registered: 0,
}));

vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: async ({ key }: { key: string }) => ({ value: device.preferences.get(key) ?? null }),
    set: async ({ key, value }: { key: string; value: string }) => {
      device.preferences.set(key, value);
    },
    remove: async ({ key }: { key: string }) => {
      device.preferences.delete(key);
    },
  },
}));

vi.mock("@capacitor/app", () => ({ App: { getInfo: async () => ({ version: "1.4.0" }) } }));

vi.mock("@capacitor/core", () => ({ Capacitor: { getPlatform: () => "android" } }));

vi.mock("@capacitor/push-notifications", () => ({
  PushNotifications: {
    checkPermissions: async () => ({ receive: device.permission }),
    requestPermissions: async () => {
      device.permission = device.answer;
      return { receive: device.permission };
    },
    addListener: async (event: string, listener: (event: unknown) => void) => {
      device.listeners.set(event, listener);
      return { remove: async () => void device.listeners.delete(event) };
    },
    register: async () => {
      device.registered += 1;
      device.listeners.get("registration")?.({ value: `fcm-token-${device.registered}` });
    },
  },
}));

/** An API client whose answers the test picks, recording each request. */
function apiAnswering(status = 204, data: unknown = undefined) {
  const requests: Array<{ path: string; body: unknown }> = [];
  const api = {
    POST: vi.fn(async (path: string, { body }: { body: unknown }) => {
      requests.push({ path, body });
      return { data, response: new Response(null, { status }) };
    }),
  } as unknown as ApiClient;
  return { api, requests };
}

beforeEach(() => {
  device.preferences.clear();
  device.listeners.clear();
  device.permission = "prompt";
  device.answer = "granted";
  device.registered = 0;
});

describe("push notifications in the mobile app", () => {
  it("asks for the permission, then saves the device's token with the API", async () => {
    const { api, requests } = apiAnswering();
    await enablePush(api);
    expect(requests).toEqual([
      {
        path: "/api/push/devices",
        body: { token: "fcm-token-1", service: "fcm", platform: "android" },
      },
    ]);
    expect(await isPushEnabled()).toBe(true);
  });

  it("says so when the permission is refused, and saves nothing", async () => {
    device.answer = "denied";
    const { api, requests } = apiAnswering();
    await expect(enablePush(api)).rejects.toThrow(PushError);
    expect(requests).toEqual([]);
    expect(await isPushEnabled()).toBe(false);
  });

  it("says so when the server has no push notifications set up", async () => {
    const { api } = apiAnswering(503);
    await expect(enablePush(api)).rejects.toThrow(
      "Push notifications are not set up on the server yet.",
    );
    expect(await isPushEnabled()).toBe(false);
  });

  it("forgets the token, on the server too, when turned off", async () => {
    const { api, requests } = apiAnswering();
    await enablePush(api);
    await disablePush(api);
    expect(requests.at(-1)).toEqual({
      path: "/api/push/devices/remove",
      body: { token: "fcm-token-1" },
    });
    expect(await isPushEnabled()).toBe(false);
  });

  it("sends the token again at the start, and opens the page a tapped notification names", async () => {
    const { api, requests } = apiAnswering();
    await enablePush(api);
    const opened: string[] = [];
    await startPush(api, (path) => opened.push(path));
    expect(requests.map(({ path }) => path)).toEqual(["/api/push/devices", "/api/push/devices"]);

    device.listeners.get("pushNotificationActionPerformed")?.({
      notification: { data: { url: "/settings", body: '{"url":"/settings"}' } },
    });
    expect(opened).toEqual(["/settings"]);
  });

  it("forgets the token at the start when the phone's settings took the permission back", async () => {
    const { api, requests } = apiAnswering();
    await enablePush(api);
    device.permission = "denied";
    await startPush(api, () => {});
    expect(requests.at(-1)?.path).toBe("/api/push/devices/remove");
    expect(await isPushEnabled()).toBe(false);
  });
});

describe("notificationPath", () => {
  it.each([
    [{ url: "/settings" }, "/settings"],
    [{ body: '{"url":"/billing"}' }, "/billing"],
    [{ body: { url: "/jobs" } }, "/jobs"],
    ['{"url":"/"}', "/"],
    [{ url: "https://example.com" }, null],
    [{ url: "//example.com" }, null],
    [{ body: "not json" }, null],
    [null, null],
  ])("opens %j at %j", (data, path) => {
    expect(notificationPath(data)).toBe(path);
  });
});

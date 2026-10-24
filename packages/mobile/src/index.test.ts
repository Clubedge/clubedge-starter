import { beforeEach, describe, expect, it, vi } from "vitest";
import { appVersion, storage } from "./index";

// Capacitor's plugins call into the native app; these stand-ins answer as its Android and iOS
// code does: Preferences keeps strings by key, and App describes the installed app.
const device = vi.hoisted(() => ({ preferences: new Map<string, string>() }));

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

vi.mock("@capacitor/app", () => ({
  App: {
    getInfo: async () => ({
      name: "Clubedge",
      id: "com.example.app",
      build: "12",
      version: "1.4.0",
    }),
  },
}));

beforeEach(() => device.preferences.clear());

describe("storage", () => {
  it("keeps strings by key until they are removed", async () => {
    expect(await storage.get("session")).toBeNull();
    await storage.set("session", "token-1");
    await storage.set("session", "token-2");
    expect(await storage.get("session")).toBe("token-2");
    await storage.remove("session");
    expect(await storage.get("session")).toBeNull();
  });

  it("keeps each key apart", async () => {
    await storage.set("a", "1");
    await storage.set("b", "2");
    await storage.remove("a");
    expect(await storage.get("b")).toBe("2");
  });
});

describe("appVersion", () => {
  it("is the version the store lists, not the build number", async () => {
    expect(await appVersion()).toBe("1.4.0");
  });
});

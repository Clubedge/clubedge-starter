import { describe, expect, it } from "vitest";
import type { AppPlatform, AppVersion } from "@clubedge/contract";
import { createApp } from "@/app";

const app = (appVersion?: (platform: AppPlatform | null) => AppVersion) =>
  createApp({
    serviceId: "my-product",
    isReady: async () => true,
    getCurrentUser: async () => null,
    appVersion,
  });

const versions: AppVersion = {
  minimumVersion: "1.2.0",
  latestVersion: "1.4.1",
  updateUrl: "https://apps.example.com/my-product",
  nextMinimumVersion: "1.3.0",
  nextMinimumFrom: "2026-11-01T00:00:00.000Z",
};

describe("/api/app-version", () => {
  it("answers null versions until the composition root sets them, never cached", async () => {
    const response = await app().request("/api/app-version");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      minimumVersion: null,
      latestVersion: null,
      updateUrl: null,
      nextMinimumVersion: null,
      nextMinimumFrom: null,
    });
  });

  it("serves the versions from the composition root", async () => {
    const response = await app(() => versions).request("/api/app-version");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(versions);
  });

  it("serves the platform the app names its versions", async () => {
    const platforms: Array<AppPlatform | null> = [];
    const api = app((platform) => {
      platforms.push(platform);
      return versions;
    });
    await api.request("/api/app-version", { headers: { "X-App-Platform": "ios" } });
    await api.request("/api/app-version", { headers: { "X-App-Platform": "web" } });
    await api.request("/api/app-version");
    expect(platforms).toEqual(["ios", null, null]);
  });
});

describe("apps below the minimum", () => {
  const api = app(() => versions);
  const from = (version: string) => ({ headers: { "X-App-Version": version } });

  it("are answered 426 update_required", async () => {
    const response = await api.request("/api/session", from("1.1.9"));
    expect(response.status).toBe(426);
    expect(await response.json()).toEqual({
      error: { code: "update_required", message: expect.any(String) },
    });
  });

  it("are refused by the minimum of the platform they name", async () => {
    const byPlatform = app((platform) => ({
      ...versions,
      minimumVersion: platform === "ios" ? "1.3.0" : "1.2.0",
    }));
    const on = (platform: string) => ({
      headers: { "X-App-Version": "1.2.5", "X-App-Platform": platform },
    });
    expect((await byPlatform.request("/api/session", on("ios"))).status).toBe(426);
    expect((await byPlatform.request("/api/session", on("android"))).status).toBe(200);
  });

  it("can still learn whether to update, and where", async () => {
    for (const path of ["/api/health", "/api/ready", "/api/app-version"]) {
      expect((await api.request(path, from("1.1.9"))).status).toBe(200);
    }
  });

  it("are the only ones refused: apps below an announced minimum are still served", async () => {
    expect((await api.request("/api/session", from("1.2.0"))).status).toBe(200);
    expect((await api.request("/api/session")).status).toBe(200);
    expect((await api.request("/api/session", from("beta"))).status).toBe(200);
  });

  it("are served while the APP_* variables have a mistake, which /api/app-version reports", async () => {
    const broken = app(() => {
      throw new Error("App version environment validation failed.");
    });
    expect((await broken.request("/api/session", from("1.1.9"))).status).toBe(200);
  });
});

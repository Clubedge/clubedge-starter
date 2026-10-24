import { describe, expect, it } from "vitest";
import type { AppVersion } from "@clubedge/contract";
import { createApp } from "@/app";

const app = (appVersion?: () => AppVersion) =>
  createApp({
    serviceId: "my-product",
    isReady: async () => true,
    getCurrentUser: async () => null,
    appVersion,
  });

describe("/api/app-version", () => {
  it("answers null versions until the composition root sets them, never cached", async () => {
    const response = await app().request("/api/app-version");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      minimumVersion: null,
      latestVersion: null,
      updateUrl: null,
    });
  });

  it("serves the versions from the composition root", async () => {
    const versions: AppVersion = {
      minimumVersion: "1.2.0",
      latestVersion: "1.4.1",
      updateUrl: "https://apps.example.com/my-product",
    };
    const response = await app(() => versions).request("/api/app-version");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(versions);
  });
});

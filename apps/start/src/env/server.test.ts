import { afterEach, describe, expect, it, vi } from "vitest";

async function loadFreshModule() {
  vi.resetModules();
  return import("./server");
}

describe("server env", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not validate at import time", async () => {
    vi.stubEnv("DATABASE_URL", "");
    await expect(loadFreshModule()).resolves.toBeDefined();
  });

  it("throws on first use when required variables are missing", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const { getServerEnv } = await loadFreshModule();
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => getServerEnv()).toThrow("Server environment validation failed");
  });

  it("defaults APP_URL for local development", async () => {
    const { getAppUrl } = await loadFreshModule();
    vi.stubEnv("APP_URL", "");
    expect(getAppUrl()).toBe("http://localhost:3000");
    vi.stubEnv("APP_URL", "https://app.example");
    expect(getAppUrl()).toBe("https://app.example");
  });
});

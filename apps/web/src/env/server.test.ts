import { afterEach, describe, expect, it, vi } from "vitest";

async function loadFreshModule() {
  vi.resetModules();
  return import("./server");
}

describe("getServerEnv", () => {
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

  it("parses and applies defaults once variables are present", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/app");
    vi.stubEnv("STORAGE_PROVIDER", undefined);
    const { getServerEnv } = await loadFreshModule();
    expect(getServerEnv()).toMatchObject({
      DATABASE_URL: "postgresql://localhost/app",
      STORAGE_PROVIDER: "s3",
      STORAGE_REGION: "auto",
    });
  });
});

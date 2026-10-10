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

  it("reports Supabase Auth only when both values are present", async () => {
    const { getSupabaseAuthEnv } = await loadFreshModule();
    vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "");
    expect(getSupabaseAuthEnv()).toBeNull();

    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_123");
    expect(getSupabaseAuthEnv()).toEqual({
      url: "https://project.supabase.co",
      publishableKey: "sb_publishable_123",
    });

    vi.stubEnv("SUPABASE_URL", "not a url");
    expect(() => getSupabaseAuthEnv()).toThrow("SUPABASE_URL must be an absolute URL.");
  });

  it("defaults APP_URL for local development", async () => {
    const { getAppUrl } = await loadFreshModule();
    vi.stubEnv("APP_URL", "");
    expect(getAppUrl()).toBe("http://localhost:3000");
    vi.stubEnv("APP_URL", "https://app.example");
    expect(getAppUrl()).toBe("https://app.example");
  });
});

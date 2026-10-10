import { afterEach, describe, expect, it, vi } from "vitest";
import { getSupabaseAuthEnv } from "./auth";

describe("getSupabaseAuthEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reports Supabase Auth only when both values are present", () => {
    vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "");
    expect(getSupabaseAuthEnv()).toBeNull();

    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_123");
    expect(getSupabaseAuthEnv()).toEqual({
      url: "https://project.supabase.co",
      publishableKey: "sb_publishable_123",
    });
  });

  it("rejects a malformed URL", () => {
    vi.stubEnv("SUPABASE_URL", "not a url");
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => getSupabaseAuthEnv()).toThrow("Supabase Auth environment validation failed");
  });
});

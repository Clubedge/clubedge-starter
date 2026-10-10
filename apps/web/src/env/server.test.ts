import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

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
    vi.stubEnv("NODE_ENV", "test");
    const { getServerEnv } = await loadFreshModule();
    expect(getServerEnv()).toEqual({
      DATABASE_URL: "postgresql://localhost/app",
      NODE_ENV: "test",
    });
  });
});

describe("parseEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("names the module whose variables are invalid", async () => {
    vi.stubEnv("EXAMPLE_URL", "not a url");
    const { parseEnv } = await loadFreshModule();
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => parseEnv(z.object({ EXAMPLE_URL: z.url() }), "Example")).toThrow(
      "Example environment validation failed",
    );
  });

  it("accepts optional variables left empty", async () => {
    vi.stubEnv("EXAMPLE_URL", "");
    const { optional, parseEnv } = await loadFreshModule();
    expect(parseEnv(z.object({ EXAMPLE_URL: optional(z.url()) }), "Example")).toEqual({
      EXAMPLE_URL: "",
    });
  });
});

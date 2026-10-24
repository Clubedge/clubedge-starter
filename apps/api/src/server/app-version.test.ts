import { afterEach, describe, expect, it, vi } from "vitest";
import { appVersion, appVersionProblems } from "./app-version";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const notAVersion = (key: string) => `${key} is not MAJOR.MINOR.PATCH, such as 1.4.0`;

describe("appVersion", () => {
  it("reads the versions and where to get the update", () => {
    vi.stubEnv("APP_MINIMUM_VERSION", "1.2.0");
    vi.stubEnv("APP_LATEST_VERSION", "1.10.0");
    vi.stubEnv("APP_UPDATE_URL", "https://apps.example.com/my-product");
    expect(appVersion()).toEqual({
      minimumVersion: "1.2.0",
      latestVersion: "1.10.0",
      updateUrl: "https://apps.example.com/my-product",
    });
  });

  it("answers null for each empty variable, as in a copied .env.example", () => {
    vi.stubEnv("APP_MINIMUM_VERSION", "");
    vi.stubEnv("APP_LATEST_VERSION", "");
    vi.stubEnv("APP_UPDATE_URL", "");
    expect(appVersion()).toEqual({ minimumVersion: null, latestVersion: null, updateUrl: null });
  });

  // The route then fails, and is reported, rather than telling the apps something wrong.
  it("throws while a variable is not valid", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("APP_MINIMUM_VERSION", "1.2");
    expect(() => appVersion()).toThrow("App version environment validation failed");
    expect(log).toHaveBeenCalled();
  });
});

describe("appVersionProblems", () => {
  it("accepts unset variables", () => {
    expect(appVersionProblems({})).toEqual([]);
  });

  it("names each variable that is not valid", () => {
    expect(
      appVersionProblems({
        APP_MINIMUM_VERSION: "1.2",
        APP_LATEST_VERSION: "v1.4.0",
        APP_UPDATE_URL: "http://apps.example.com/my-product",
      }),
    ).toEqual([
      notAVersion("APP_MINIMUM_VERSION"),
      notAVersion("APP_LATEST_VERSION"),
      "APP_UPDATE_URL is not an https:// URL",
    ]);
  });

  it("compares the versions number by number", () => {
    const problems = (minimum: string, latest: string) =>
      appVersionProblems({ APP_MINIMUM_VERSION: minimum, APP_LATEST_VERSION: latest });
    expect(problems("1.9.0", "1.10.0")).toEqual([]);
    expect(problems("1.4.0", "1.4.0")).toEqual([]);
    expect(problems("1.10.0", "1.9.0")).toEqual([
      "APP_LATEST_VERSION is older than APP_MINIMUM_VERSION",
    ]);
  });
});

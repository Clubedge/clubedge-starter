import { afterEach, describe, expect, it, vi } from "vitest";
import { appVersion, appVersionProblems } from "./app-version";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const notAVersion = (key: string) => `${key} is not MAJOR.MINOR.PATCH, such as 1.4.0`;

const unset = {
  minimumVersion: null,
  latestVersion: null,
  updateUrl: null,
  nextMinimumVersion: null,
  nextMinimumFrom: null,
};

const stub = (variables: Record<string, string>) => {
  for (const [key, value] of Object.entries(variables)) vi.stubEnv(key, value);
};

describe("appVersion", () => {
  it("reads the versions and where to get the update", () => {
    stub({
      APP_MINIMUM_VERSION: "1.2.0",
      APP_LATEST_VERSION: "1.10.0",
      APP_UPDATE_URL: "https://apps.example.com/my-product",
    });
    expect(appVersion()).toEqual({
      ...unset,
      minimumVersion: "1.2.0",
      latestVersion: "1.10.0",
      updateUrl: "https://apps.example.com/my-product",
    });
  });

  it("answers null for each empty variable, as in a copied .env.example", () => {
    stub({ APP_MINIMUM_VERSION: "", APP_LATEST_VERSION: "", APP_UPDATE_URL: "" });
    expect(appVersion()).toEqual(unset);
  });

  it("gives a platform its own variables, and the shared ones otherwise", () => {
    stub({
      APP_MINIMUM_VERSION: "1.2.0",
      APP_LATEST_VERSION: "1.4.0",
      APP_LATEST_VERSION_IOS: "1.3.0",
      APP_UPDATE_URL: "https://example.com/download",
      APP_UPDATE_URL_IOS: "https://apps.apple.com/app/id1",
      APP_UPDATE_URL_ANDROID: "https://play.google.com/store/apps/details?id=com.example",
    });
    expect(appVersion("ios")).toMatchObject({
      minimumVersion: "1.2.0",
      latestVersion: "1.3.0",
      updateUrl: "https://apps.apple.com/app/id1",
    });
    expect(appVersion("android")).toMatchObject({
      latestVersion: "1.4.0",
      updateUrl: "https://play.google.com/store/apps/details?id=com.example",
    });
    expect(appVersion(null)).toMatchObject({
      latestVersion: "1.4.0",
      updateUrl: "https://example.com/download",
    });
  });

  describe("an announced minimum", () => {
    const announced = {
      APP_MINIMUM_VERSION: "1.0.0",
      APP_NEXT_MINIMUM_VERSION: "1.2.0",
      APP_NEXT_MINIMUM_VERSION_FROM: "2026-11-01T01:00:00+01:00",
    };
    const deadline = new Date("2026-11-01T00:00:00Z");

    it("is announced until its date, in UTC", () => {
      stub(announced);
      expect(appVersion(null, new Date(deadline.getTime() - 1))).toEqual({
        ...unset,
        minimumVersion: "1.0.0",
        nextMinimumVersion: "1.2.0",
        nextMinimumFrom: "2026-11-01T00:00:00.000Z",
      });
    });

    it("becomes the minimum on its date, with no redeploy", () => {
      stub(announced);
      expect(appVersion(null, deadline)).toEqual({ ...unset, minimumVersion: "1.2.0" });
    });

    it("can be one platform's", () => {
      stub({
        APP_MINIMUM_VERSION: "1.0.0",
        APP_NEXT_MINIMUM_VERSION_ANDROID: "1.2.0",
        APP_NEXT_MINIMUM_VERSION_FROM_ANDROID: "2026-11-01T00:00:00Z",
      });
      expect(appVersion("android", deadline).minimumVersion).toBe("1.2.0");
      expect(appVersion("ios", deadline).minimumVersion).toBe("1.0.0");
    });
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
        APP_LATEST_VERSION_IOS: "1.4",
        APP_NEXT_MINIMUM_VERSION_FROM: "2026-11-01",
      }),
    ).toEqual([
      notAVersion("APP_MINIMUM_VERSION"),
      notAVersion("APP_LATEST_VERSION"),
      "APP_NEXT_MINIMUM_VERSION_FROM is not a date and time with its time zone, such as 2026-11-01T00:00:00Z",
      "APP_UPDATE_URL is not an https:// URL",
      notAVersion("APP_LATEST_VERSION_IOS"),
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

  it("checks a platform's own versions against the ones it shares", () => {
    expect(
      appVersionProblems({ APP_MINIMUM_VERSION: "1.2.0", APP_LATEST_VERSION_IOS: "1.1.0" }),
    ).toEqual(["APP_LATEST_VERSION_IOS is older than APP_MINIMUM_VERSION"]);
  });

  it("checks an announced minimum", () => {
    const from = "2026-11-01T00:00:00Z";
    expect(appVersionProblems({ APP_NEXT_MINIMUM_VERSION: "1.2.0" })).toEqual([
      "APP_NEXT_MINIMUM_VERSION and APP_NEXT_MINIMUM_VERSION_FROM go together: set both, or neither",
    ]);
    expect(
      appVersionProblems({
        APP_MINIMUM_VERSION: "1.2.0",
        APP_NEXT_MINIMUM_VERSION: "1.2.0",
        APP_NEXT_MINIMUM_VERSION_FROM: from,
      }),
    ).toEqual(["APP_NEXT_MINIMUM_VERSION is not newer than APP_MINIMUM_VERSION"]);
    expect(
      appVersionProblems({
        APP_LATEST_VERSION: "1.1.0",
        APP_NEXT_MINIMUM_VERSION: "1.2.0",
        APP_NEXT_MINIMUM_VERSION_FROM: from,
      }),
    ).toEqual(["APP_LATEST_VERSION is older than APP_NEXT_MINIMUM_VERSION"]);
  });
});

import { describe, expect, it } from "vitest";
import { appPlatform, isOlder, parseVersion, updateStatus } from "./app-version";

const versions = (served: {
  minimumVersion?: string | null;
  latestVersion?: string | null;
  nextMinimumVersion?: string | null;
}) => ({
  minimumVersion: null,
  latestVersion: null,
  updateUrl: null,
  nextMinimumVersion: null,
  nextMinimumFrom: null,
  ...served,
});

describe("versions", () => {
  it("parses MAJOR.MINOR.PATCH, counting missing parts as 0", () => {
    expect(parseVersion("1.4.2")).toEqual([1, 4, 2]);
    expect(parseVersion(" 1.0 ")).toEqual([1, 0, 0]);
    expect(parseVersion("2")).toEqual([2, 0, 0]);
    expect(parseVersion("v1.4.0")).toBeNull();
    expect(parseVersion("1.4.0-beta")).toBeNull();
  });

  it("compares number by number", () => {
    expect(isOlder("1.9.0", "1.10.0")).toBe(true);
    expect(isOlder("1.10.0", "1.9.0")).toBe(false);
    expect(isOlder("1.4.0", "1.4.0")).toBe(false);
    expect(isOlder("1.4", "1.4.1")).toBe(true);
    expect(isOlder("beta", "1.0.0")).toBe(false);
  });

  it("reads the platform a request names", () => {
    expect(appPlatform("ios")).toBe("ios");
    expect(appPlatform(" Android ")).toBe("android");
    expect(appPlatform("web")).toBeNull();
    expect(appPlatform(undefined)).toBeNull();
  });
});

describe("updateStatus", () => {
  it("requires versions below the minimum", () => {
    expect(updateStatus("1.1.0", versions({ minimumVersion: "1.2.0" }))).toBe("required");
    expect(updateStatus("1.2.0", versions({ minimumVersion: "1.2.0" }))).toBe("current");
  });

  it("warns versions below an announced minimum, before its date", () => {
    const served = versions({
      minimumVersion: "1.0.0",
      nextMinimumVersion: "1.2.0",
      latestVersion: "1.3.0",
    });
    expect(updateStatus("1.1.0", served)).toBe("upcoming");
    expect(updateStatus("1.2.0", served)).toBe("available");
    expect(updateStatus("0.9.0", served)).toBe("required");
  });

  it("offers versions below the latest only", () => {
    expect(updateStatus("1.2.0", versions({ latestVersion: "1.10.0" }))).toBe("available");
    expect(updateStatus("1.10.0", versions({ latestVersion: "1.10.0" }))).toBe("current");
    expect(updateStatus("1.2.0", versions({}))).toBe("current");
  });

  it("can't tell without the API's answer or a version", () => {
    expect(updateStatus("1.2.0", null)).toBeNull();
    expect(updateStatus("beta", versions({ minimumVersion: "1.2.0" }))).toBeNull();
  });

  // Installed apps meet APIs from before nextMinimumVersion, and APIs meet apps from before it.
  it("reads an older API's answer, without the announced minimum", () => {
    const older = { minimumVersion: "1.2.0", latestVersion: "1.3.0", updateUrl: null };
    expect(updateStatus("1.1.0", older)).toBe("required");
    expect(updateStatus("1.2.0", older)).toBe("available");
  });
});

import { describe, expect, it } from "vitest";
import { isOlder, parseVersion, updateFor } from "./version";

describe("parseVersion", () => {
  it("reads MAJOR.MINOR.PATCH, with missing parts as 0", () => {
    expect(parseVersion("1.4.2")).toEqual([1, 4, 2]);
    expect(parseVersion(" 10.0.12 ")).toEqual([10, 0, 12]);
    // New Android and iOS projects start at 1.0.
    expect(parseVersion("1.0")).toEqual([1, 0, 0]);
    expect(parseVersion("2")).toEqual([2, 0, 0]);
  });

  it("refuses anything else", () => {
    for (const version of ["", "v1.0.0", "1.0.0-beta", "1.0.0.1", "1..0", "one"]) {
      expect(parseVersion(version), version).toBeNull();
    }
  });
});

describe("isOlder", () => {
  it("compares the numbers, not the text", () => {
    expect(isOlder([1, 9, 0], [1, 10, 0])).toBe(true);
    expect(isOlder([1, 10, 0], [1, 9, 0])).toBe(false);
    expect(isOlder([0, 9, 9], [1, 0, 0])).toBe(true);
    expect(isOlder([1, 2, 3], [1, 2, 3])).toBe(false);
    expect(isOlder([1, 2, 4], [1, 2, 3])).toBe(false);
  });
});

describe("updateFor", () => {
  const versions = {
    minimumVersion: "1.2.0",
    latestVersion: "1.4.0",
    updateUrl: "https://example.com/app",
  };

  it("requires an update below the minimum version", () => {
    expect(updateFor("1.1.9", versions)).toBe("required");
    expect(updateFor("1.0", versions)).toBe("required");
  });

  it("offers an update below the latest version only", () => {
    expect(updateFor("1.2.0", versions)).toBe("available");
    expect(updateFor("1.3.7", versions)).toBe("available");
  });

  it("says nothing to an app that is current", () => {
    expect(updateFor("1.4.0", versions)).toBeNull();
    expect(updateFor("2.0.0", versions)).toBeNull();
  });

  it("says nothing when it cannot tell", () => {
    // The API did not answer, or sets no versions.
    expect(updateFor("1.0.0", null)).toBeNull();
    expect(
      updateFor("1.0.0", { minimumVersion: null, latestVersion: null, updateUrl: null }),
    ).toBeNull();
    // A version the app was built with that is not MAJOR.MINOR.PATCH counts as current.
    expect(updateFor("1.0.0-beta", versions)).toBeNull();
  });

  it("offers an update with only a latest version set", () => {
    expect(updateFor("1.0.0", { ...versions, minimumVersion: null })).toBe("available");
  });
});

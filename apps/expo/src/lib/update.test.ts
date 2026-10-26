import { describe, expect, it } from "vitest";
import { isOlder, parseVersion, updateFor } from "./update";

const served = (minimumVersion: string | null, latestVersion: string | null) => ({
  minimumVersion,
  latestVersion,
  updateUrl: null,
});

describe("the update check", () => {
  it("reads MAJOR.MINOR.PATCH versions, missing parts as 0", () => {
    expect(parseVersion("1.4.2")).toEqual([1, 4, 2]);
    expect(parseVersion("1.0")).toEqual([1, 0, 0]);
    expect(parseVersion("1.0-beta")).toBeNull();
  });

  it("compares part by part, as numbers", () => {
    expect(isOlder([1, 9, 0], [1, 10, 0])).toBe(true);
    expect(isOlder([2, 0, 0], [1, 10, 0])).toBe(false);
    expect(isOlder([1, 2, 3], [1, 2, 3])).toBe(false);
  });

  it("requires an update below the minimum, and offers one below the latest", () => {
    expect(updateFor("1.0.0", served("1.1.0", "1.2.0"))).toBe("required");
    expect(updateFor("1.1.0", served("1.1.0", "1.2.0"))).toBe("available");
    expect(updateFor("1.2.0", served("1.1.0", "1.2.0"))).toBeNull();
  });

  it("lets the app carry on without versions, or with a version it cannot read", () => {
    expect(updateFor("1.0.0", null)).toBeNull();
    expect(updateFor("1.0.0", served(null, null))).toBeNull();
    expect(updateFor("dev", served("9.0.0", null))).toBeNull();
  });
});

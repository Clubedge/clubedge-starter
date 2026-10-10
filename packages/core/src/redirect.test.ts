import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./redirect";

describe("safeRedirectPath", () => {
  it("keeps same-origin paths with query and hash", () => {
    expect(safeRedirectPath("/dashboard")).toBe("/dashboard");
    expect(safeRedirectPath("/projects/1?tab=a#top")).toBe("/projects/1?tab=a#top");
  });

  it.each([
    undefined,
    null,
    "",
    "dashboard",
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
  ])("falls back for %j", (value) => {
    expect(safeRedirectPath(value)).toBe("/dashboard");
  });

  it("uses the provided fallback", () => {
    expect(safeRedirectPath("https://evil.example", "/")).toBe("/");
  });
});

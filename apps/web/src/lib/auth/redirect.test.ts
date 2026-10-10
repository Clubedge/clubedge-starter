import { describe, expect, it } from "vitest";
import { loginUrl, safeRedirectPath } from "./redirect";

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

describe("loginUrl", () => {
  it("builds the plain login path", () => {
    expect(loginUrl()).toBe("/login");
  });

  it("omits the default destination and encodes everything else", () => {
    expect(loginUrl({ next: "/dashboard" })).toBe("/login");
    expect(loginUrl({ mode: "signup", error: "invalid-input", next: "/a?b=c" })).toBe(
      "/login?mode=signup&error=invalid-input&next=%2Fa%3Fb%3Dc",
    );
    expect(loginUrl({ mode: "signup", checkEmail: true })).toBe("/login?mode=signup&check-email=1");
  });
});

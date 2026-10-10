import { describe, expect, it } from "vitest";
import { loginUrl } from "./login-url";

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

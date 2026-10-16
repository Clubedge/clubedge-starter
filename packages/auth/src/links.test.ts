import { describe, expect, it } from "vitest";
import { linkToken, splitLinkToken } from "./links";

describe("linkToken", () => {
  it("reads a code or token parameter", () => {
    expect(linkToken(new URLSearchParams("code=abc&next=/x"), "code")).toBe("abc");
    expect(linkToken({ token: "t1" }, "token")).toBe("t1");
  });

  it("joins Appwrite's userId and secret, and splits them back", () => {
    const token = linkToken(new URLSearchParams("userId=u1&secret=s1&expire=2026"), "token");
    expect(token).toBe("u1:s1");
    expect(splitLinkToken(token!)).toEqual({ userId: "u1", secret: "s1" });
  });

  it("is null without either, and splits only its own tokens", () => {
    expect(linkToken(new URLSearchParams("next=/x"), "code")).toBeNull();
    expect(linkToken({ userId: "u1" }, "token")).toBeNull();
    expect(splitLinkToken("not-a-token")).toBeNull();
    expect(splitLinkToken("a:b:c")).toBeNull();
  });
});

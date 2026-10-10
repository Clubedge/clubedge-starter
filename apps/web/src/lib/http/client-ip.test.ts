import { describe, expect, it } from "vitest";
import { getClientIp } from "./client-ip";

describe("getClientIp", () => {
  it("uses the first x-forwarded-for address", () => {
    expect(getClientIp(new Headers({ "x-forwarded-for": "203.0.113.1, 10.0.0.1" }))).toBe(
      "203.0.113.1",
    );
  });

  it("falls back to x-real-ip, then to unknown", () => {
    expect(getClientIp(new Headers({ "x-real-ip": "198.51.100.7" }))).toBe("198.51.100.7");
    expect(getClientIp(new Headers())).toBe("unknown");
  });

  it("bounds the identifier length", () => {
    expect(getClientIp(new Headers({ "x-forwarded-for": "a".repeat(500) }))).toHaveLength(64);
  });
});

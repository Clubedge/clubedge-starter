import { describe, expect, it } from "vitest";
import { healthUrl } from "./keep-awake";

describe("the request that keeps the API awake", () => {
  it("asks for the API's health at the address the website calls it at", () => {
    expect(healthUrl("https://my-app-api.onrender.com")).toBe(
      "https://my-app-api.onrender.com/api/health",
    );
    // As the website joins its requests: a trailing slash is dropped.
    expect(healthUrl(" https://my-app-api.onrender.com/ ")).toBe(
      "https://my-app-api.onrender.com/api/health",
    );
    expect(healthUrl("http://127.0.0.1:3001")).toBe("http://127.0.0.1:3001/api/health");
  });

  it("asks nothing without an address", () => {
    expect(healthUrl(undefined)).toBeUndefined();
    expect(healthUrl("")).toBeUndefined();
    expect(healthUrl("  ")).toBeUndefined();
  });

  it("refuses an address that is not a web address", () => {
    expect(() => healthUrl("my-app-api.onrender.com")).toThrow(/not a web address/);
    expect(() => healthUrl("ftp://my-app-api.onrender.com")).toThrow(/not a web address/);
  });
});

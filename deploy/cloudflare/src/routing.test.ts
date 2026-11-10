import { describe, expect, it } from "vitest";
import { apiLocation, containerEnv, idleTimeoutMs, isApiPath } from "./routing";

describe("the Worker's routing", () => {
  it("sends the API's paths to the API, and the rest to the website", () => {
    expect(isApiPath("/api")).toBe(true);
    expect(isApiPath("/api/health")).toBe(true);
    expect(isApiPath("/api/account/profile")).toBe(true);
    expect(isApiPath("/")).toBe(false);
    expect(isApiPath("/dashboard")).toBe(false);
    // A page whose name starts with the same letters is the website's.
    expect(isApiPath("/apiary")).toBe(false);
  });
});

describe("the API container's settings", () => {
  it("passes the Worker's text settings on, and leaves its bindings out", () => {
    const binding = { fetch() {} };
    expect(
      containerEnv(
        { DATABASE_URL: "postgresql://db", REDIS_URL: "rediss://redis", API: binding, EMPTY: "" },
        "https://my-app.example.workers.dev",
      ),
    ).toEqual({
      DATABASE_URL: "postgresql://db",
      REDIS_URL: "rediss://redis",
      FRONTEND_URL: "https://my-app.example.workers.dev",
    });
  });

  it("keeps a FRONTEND_URL that is set", () => {
    expect(
      containerEnv({ FRONTEND_URL: "https://app.example.com" }, "https://other.example")
        .FRONTEND_URL,
    ).toBe("https://app.example.com");
  });

  it("stops the API after an hour without visitors, unless told otherwise, and six hours at most", () => {
    expect(idleTimeoutMs({})).toBe(60 * 60_000);
    expect(idleTimeoutMs({ API_IDLE_MINUTES: "15" })).toBe(15 * 60_000);
    expect(idleTimeoutMs({ API_IDLE_MINUTES: "10000" })).toBe(360 * 60_000);
    expect(idleTimeoutMs({ API_IDLE_MINUTES: "never" })).toBe(60 * 60_000);
  });

  it("asks for the API's region only when API_LOCATION is one of Cloudflare's", () => {
    expect(apiLocation({ API_LOCATION: "weur" })).toBe("weur");
    expect(apiLocation({ API_LOCATION: "enam" })).toBe("enam");
    expect(apiLocation({})).toBeUndefined();
    expect(apiLocation({ API_LOCATION: "europe" })).toBeUndefined();
    expect(apiLocation({ API_LOCATION: "" })).toBeUndefined();
  });
});

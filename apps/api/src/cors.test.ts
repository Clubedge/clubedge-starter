import { describe, expect, it } from "vitest";
import { createApp } from "@/app";
import { parseFrontendAliases } from "@/env";

// Browsers ask the API before a page on another origin may call it: the website's address, and
// the others it is served at (the one it had before a new domain), may; no other may.
const app = createApp({
  serviceId: "test",
  isReady: async () => true,
  getCurrentUser: async () => null,
  frontendOrigin: "https://app.example.com",
  frontendAliases: ["https://app.example.workers.dev"],
});

const preflight = (origin: string, method = "GET") =>
  app.request("/api/health", {
    method: "OPTIONS",
    headers: {
      origin,
      "access-control-request-method": method,
      "access-control-request-headers": "authorization",
    },
  });

describe("calls from the website's pages", () => {
  it("are let in from its address and from the others it is served at", async () => {
    for (const origin of ["https://app.example.com", "https://app.example.workers.dev"]) {
      const answer = await preflight(origin);
      expect(answer.headers.get("access-control-allow-origin")).toBe(origin);
    }
  });

  it("are kept out from any other site", async () => {
    const answer = await preflight("https://elsewhere.example");
    expect(answer.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("may use every method a route can have", async () => {
    const answer = await preflight("https://app.example.com", "DELETE");
    const allowed = answer.headers.get("access-control-allow-methods")?.split(",") ?? [];
    expect(allowed.map((method) => method.trim())).toEqual(
      expect.arrayContaining(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]),
    );
  });
});

describe("the website's other addresses", () => {
  it("are read as origins", () => {
    expect(parseFrontendAliases(undefined)).toEqual([]);
    expect(parseFrontendAliases(" https://old.example.com/path , http://localhost:3000 ")).toEqual([
      "https://old.example.com",
      "http://localhost:3000",
    ]);
  });

  it("are read as browsers send them", () => {
    // The host in lower case, and no port that is the scheme's own.
    expect(
      parseFrontendAliases("https://OLD.Example.com:443/path,http://old.example.com:80"),
    ).toEqual(["https://old.example.com", "http://old.example.com"]);
    expect(parseFrontendAliases("https://old.example.com:8443,http://[::1]:3000")).toEqual([
      "https://old.example.com:8443",
      "http://[::1]:3000",
    ]);
  });

  it("are refused, by name, without a scheme, a host or a usable port", () => {
    for (const alias of [
      "app.example.com",
      "old.example.com:8443",
      "http://:3000",
      "http://example.com:abc",
    ]) {
      expect(() => parseFrontendAliases(`https://old.example.com,${alias}`)).toThrow(
        `FRONTEND_ALIASES has "${alias}", not an absolute URL`,
      );
    }
  });
});

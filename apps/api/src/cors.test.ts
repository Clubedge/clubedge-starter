import { describe, expect, it } from "vitest";
import { createApp } from "@/app";

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

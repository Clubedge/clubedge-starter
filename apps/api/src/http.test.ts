import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { apiError, jsonOnly, limitBody } from "@/http";

const app = new Hono()
  .post("/json", jsonOnly, (c) => c.json({ ok: true }))
  .post("/small", limitBody(16), async (c) => c.text(await c.req.text()))
  .get("/error", (c) => apiError(c, 409, "conflict", "Already there."));

const post = (path: string, body: string, type?: string) =>
  app.request(path, { method: "POST", body, headers: type ? { "content-type": type } : {} });

describe("route guards", () => {
  it("accepts JSON and refuses what a cross-site form can send", async () => {
    expect((await post("/json", "{}", "application/json")).status).toBe(200);
    expect((await post("/json", "{}", "application/json; charset=utf-8")).status).toBe(200);
    for (const type of ["text/plain", "application/x-www-form-urlencoded", undefined]) {
      const response = await post("/json", "{}", type);
      expect(response.status, String(type)).toBe(415);
      expect(await response.json()).toMatchObject({ error: { code: "unsupported_media_type" } });
    }
  });

  it("refuses a body over the limit", async () => {
    expect(await (await post("/small", "within")).text()).toBe("within");
    const response = await post("/small", "x".repeat(17));
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: { code: "payload_too_large" } });
  });

  it("answers errors in the contract's shape", async () => {
    const response = await app.request("/error");
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: { code: "conflict", message: "Already there." },
    });
  });
});

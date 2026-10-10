import { beforeEach, describe, expect, it, vi } from "vitest";

const server = vi.hoisted(() => ({
  request: new Request("https://app.example/"),
  cookies: {} as Record<string, string>,
  setCookie: vi.fn(),
}));

vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => server.request,
  getCookies: () => server.cookies,
  setCookie: server.setCookie,
}));

const { requestCookieStore } = await import("./cookies");

beforeEach(() => {
  server.request = new Request("https://app.example/");
  server.cookies = { session: "old" };
  server.setCookie.mockClear();
});

describe("requestCookieStore", () => {
  it("reads the request cookies", () => {
    expect(requestCookieStore().getAll()).toEqual([{ name: "session", value: "old" }]);
  });

  it("shares writes with later readers in the same request and sends them to the browser", () => {
    const options = { httpOnly: true, path: "/" };
    requestCookieStore().setAll([{ name: "session", value: "new", options }]);

    expect(requestCookieStore().getAll()).toEqual([{ name: "session", value: "new" }]);
    expect(server.setCookie).toHaveBeenCalledWith("session", "new", options);
  });

  it("starts fresh for every request", () => {
    requestCookieStore().setAll([{ name: "session", value: "new" }]);
    server.request = new Request("https://app.example/next");
    expect(requestCookieStore().getAll()).toEqual([{ name: "session", value: "old" }]);
  });
});

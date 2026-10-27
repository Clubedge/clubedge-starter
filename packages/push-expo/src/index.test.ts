import { describe, expect, it, vi } from "vitest";
import type { PushDevice } from "@clubedge/push";
import { createExpoPush, ExpoPushError } from "./index";

const device = (id: string): PushDevice => ({
  token: `ExponentPushToken[${id}]`,
  service: "expo",
  platform: "android",
});
const message = { title: "Hello", body: "From the test", data: { url: "/settings" } };

/** A fetch that answers each request with Expo's tickets for its notifications. */
function expo(ticket: (token: string) => object = () => ({ status: "ok", id: "ticket" })) {
  return vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const notifications = JSON.parse(String(init?.body)) as Array<{ to: string }>;
    return Response.json({ data: notifications.map(({ to }) => ticket(to)) });
  });
}

describe("Expo's push service", () => {
  it("sends each notification with its data, and the access token when there is one", async () => {
    const fetch = expo();
    const result = await createExpoPush({ accessToken: "secret", fetch }).send(
      [device("a")],
      message,
    );
    expect(result).toEqual({ sent: 1, invalidTokens: [] });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("https://exp.host/--/api/v2/push/send");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer secret");
    expect(JSON.parse(String(init?.body))).toEqual([
      {
        to: "ExponentPushToken[a]",
        title: "Hello",
        body: "From the test",
        data: { url: "/settings" },
        sound: "default",
        priority: "high",
      },
    ]);
  });

  it("sends no authorization without an access token", async () => {
    const fetch = expo();
    await createExpoPush({ fetch }).send([device("a")], message);
    expect(new Headers(fetch.mock.calls[0]![1]?.headers).has("authorization")).toBe(false);
  });

  it("names the tokens of devices that are no longer registered", async () => {
    const fetch = expo((token) =>
      token.includes("gone")
        ? { status: "error", message: "not registered", details: { error: "DeviceNotRegistered" } }
        : token.includes("busy")
          ? { status: "error", message: "rate", details: { error: "MessageRateExceeded" } }
          : { status: "ok", id: "ticket" },
    );
    const result = await createExpoPush({ fetch }).send(
      [device("a"), device("gone"), device("busy")],
      message,
    );
    // A device refused for now keeps its token: only DeviceNotRegistered is for good.
    expect(result).toEqual({ sent: 1, invalidTokens: ["ExponentPushToken[gone]"] });
  });

  it("sends 100 notifications per request", async () => {
    const fetch = expo();
    const devices = Array.from({ length: 250 }, (_, index) => device(String(index)));
    expect((await createExpoPush({ fetch }).send(devices, message)).sent).toBe(250);
    expect(fetch.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).length)).toEqual([
      100, 100, 50,
    ]);
  });

  it("fails when the service refuses the request itself", async () => {
    const fetch = vi.fn(async () =>
      Response.json({ errors: [{ code: "PUSH_TOO_MANY" }] }, { status: 429 }),
    );
    await expect(createExpoPush({ fetch }).send([device("a")], message)).rejects.toThrow(
      ExpoPushError,
    );
  });
});

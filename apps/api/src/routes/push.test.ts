import { describe, expect, it } from "vitest";
import type { User } from "@clubedge/contract";
import type { PushDevice, PushMessage, PushService } from "@clubedge/push";
import { createApp } from "@/app";
import { siteConfig } from "@/config/site";
import { createMemoryLimiter, type CreateRateLimiter } from "@/rate-limit";
import type { PushNotifications } from "./push";

const ada: User = { id: "auth-ada", email: "ada@example.com", displayName: null };
const token = "ExponentPushToken[ada-phone]";

/** Push notifications kept in memory: each user's devices, and the messages sent. */
function memoryPush(services: PushService[] = ["expo"], configured = true) {
  const devices = new Map<string, { user: User; device: PushDevice }>();
  const sent: PushMessage[] = [];
  const push: PushNotifications = {
    services,
    register: async (user, device) => void devices.set(device.token, { user, device }),
    remove: async (removed) => void devices.delete(removed),
    send: async (user, message) => {
      if (!configured) return null;
      sent.push(message);
      return {
        sent: [...devices.values()].filter((entry) => entry.user.id === user.id).length,
        invalidTokens: [],
      };
    },
  };
  return { push, devices, sent };
}

function appWith(push?: PushNotifications, createRateLimiter?: CreateRateLimiter) {
  return createApp({
    serviceId: "my-product",
    isReady: async () => true,
    getCurrentUser: async (request) => (request.headers.get("authorization") ? ada : null),
    ...(push ? { push } : {}),
    ...(createRateLimiter ? { createRateLimiter } : {}),
  });
}

const post = (body: unknown, signedIn = true) => ({
  method: "POST",
  headers: {
    ...(signedIn ? { authorization: "Bearer ada" } : {}),
    "content-type": "application/json",
  },
  body: JSON.stringify(body),
});
const device = { token, service: "expo", platform: "ios" };

describe("/api/push/devices", () => {
  it("saves the device for the signed-in user, and forgets it without a session", async () => {
    const { push, devices } = memoryPush();
    const app = appWith(push);
    expect((await app.request("/api/push/devices", post(device))).status).toBe(204);
    expect(devices.get(token)).toEqual({ user: ada, device });

    expect((await app.request("/api/push/devices/remove", post({ token }, false))).status).toBe(
      204,
    );
    expect(devices.size).toBe(0);
  });

  it("needs a session to save a device", async () => {
    const response = await appWith(memoryPush().push).request(
      "/api/push/devices",
      post(device, false),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "unauthorized" } });
  });

  it.each([
    ["no token", { service: "expo", platform: "ios" }],
    ["a token of another shape", { token: "not-an-expo-token", service: "expo", platform: "ios" }],
    ["an unknown platform", { ...device, platform: "web" }],
  ])("refuses a device with %s", async (_label, body) => {
    const response = await appWith(memoryPush().push).request("/api/push/devices", post(body));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "invalid_input" } });
  });

  it("refuses a token of a service the server does not send through, and names those it does", async () => {
    const app = appWith(memoryPush(["fcm", "apns"]).push);
    const response = await app.request("/api/push/devices", post(device));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "invalid_input",
        message: "This server sends notifications through FCM and APNs.",
      },
    });
    const android = { token: "fcm-token:APA91b", service: "fcm", platform: "android" };
    expect((await app.request("/api/push/devices", post(android))).status).toBe(204);
  });

  it("takes only JSON", async () => {
    const response = await appWith(memoryPush().push).request("/api/push/devices", {
      method: "POST",
      headers: { authorization: "Bearer ada", "content-type": "text/plain" },
      body: JSON.stringify(device),
    });
    expect(response.status).toBe(415);
  });

  it("is not configured without the push service", async () => {
    const response = await appWith().request("/api/push/devices", post(device));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: "not_configured" } });
  });
});

describe("/api/push/test", () => {
  it("sends the project's test notification to the user's devices", async () => {
    const { push, sent } = memoryPush();
    const app = appWith(push);
    await app.request("/api/push/devices", post(device));
    const response = await app.request("/api/push/test", post({}));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ sent: 1, removed: 0 });
    expect(sent).toEqual([
      { title: siteConfig.name, body: "Notifications work on this device.", data: { url: "/" } },
    ]);
  });

  it("says when no push service is set up", async () => {
    const response = await appWith(memoryPush(["fcm", "apns"], false).push).request(
      "/api/push/test",
      post({}),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: "not_configured" } });
  });

  it("says when the push service fails", async () => {
    const { push } = memoryPush();
    push.send = async () => {
      throw new Error("FCM refused the request");
    };
    const response = await appWith(push).request("/api/push/test", post({}));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: "unavailable" } });
  });

  it("limits the test notifications each user asks for", async () => {
    // One a window here, so the second one waits.
    const app = appWith(memoryPush().push, () => createMemoryLimiter(1, 30));
    expect((await app.request("/api/push/test", post({}))).status).toBe(200);
    const limited = await app.request("/api/push/test", post({}));
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("needs a session", async () => {
    const response = await appWith(memoryPush().push).request("/api/push/test", post({}, false));
    expect(response.status).toBe(401);
  });
});

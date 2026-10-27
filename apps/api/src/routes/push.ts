// Push notifications' endpoints: the mobile apps save their device's push token for the
// signed-in user, forget it when they sign out, and ask for a test notification. Sending
// itself happens from the server's own code, through the PushNotifications service below.
import { Hono, type Context, type MiddlewareHandler } from "hono";
import { z } from "zod";
import type { components, User } from "@clubedge/contract";
import { reportError } from "@clubedge/core";
import {
  isPushToken,
  pushServices,
  type PushDevice,
  type PushMessage,
  type PushResult,
  type PushService,
} from "@clubedge/push";
import type { ApiDependencies } from "@/app";
import { siteConfig } from "@/config/site";
import { apiError, jsonOnly, limitBody } from "@/http";
import { createMemoryLimiter } from "@/rate-limit";

/** What the routes need from the composition root (src/server/push). */
export interface PushNotifications {
  /** The services whose tokens this server takes: Expo's, or FCM and APNs. */
  services: readonly PushService[];
  register(user: User, device: PushDevice): Promise<void>;
  remove(token: string): Promise<void>;
  /**
   * Sends to each of the user's devices a push service is set up for, and forgets the tokens
   * it refuses for good. Null while no push service is set up.
   */
  send(user: User, message: PushMessage): Promise<PushResult | null>;
}

const MAX_BODY = 8_192;

const deviceSchema = z.object({
  token: z.string().min(1).max(4_096),
  service: z.enum(pushServices as [PushService, ...PushService[]]),
  platform: z.enum(["ios", "android"]),
});
const removalSchema = z.object({ token: z.string().min(1).max(4_096) });

type Env = { Variables: { user: User } };

/** The body as JSON, or null. Read outside the try: limitBody answers 413 for a large one. */
async function readJson(c: Context): Promise<unknown> {
  const body = await c.req.text();
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

const serviceNames: Record<PushService, string> = {
  expo: "Expo's push service",
  fcm: "FCM",
  apns: "APNs",
};

export function pushRoutes(dependencies: ApiDependencies) {
  // Test notifications, per user: each one reaches every device the user has.
  const limiter = (dependencies.createRateLimiter ?? createMemoryLimiter)(5, 60);
  const notConfigured = "Push notifications are not set up on this server.";

  const signedIn: MiddlewareHandler<Env> = async (c, next) => {
    c.header("Cache-Control", "no-store");
    const user = await dependencies.getCurrentUser(c.req.raw);
    if (!user) return apiError(c, 401, "unauthorized", "Sign in first.");
    c.set("user", user);
    await next();
  };

  return new Hono<Env>()
    .post("/api/push/devices", jsonOnly, limitBody(MAX_BODY), signedIn, async (c) => {
      const push = dependencies.push;
      if (!push) return apiError(c, 503, "not_configured", notConfigured);
      const parsed = deviceSchema.safeParse(await readJson(c));
      if (!parsed.success || !isPushToken(parsed.data.service, parsed.data.token)) {
        return apiError(
          c,
          400,
          "invalid_input",
          "Send the device's push token, its service, and its platform.",
        );
      }
      if (!push.services.includes(parsed.data.service)) {
        const names = push.services.map((service) => serviceNames[service]).join(" and ");
        return apiError(
          c,
          400,
          "invalid_input",
          `This server sends notifications through ${names}.`,
        );
      }
      await push.register(c.get("user"), parsed.data);
      return c.body(null, 204);
    })
    .post("/api/push/devices/remove", jsonOnly, limitBody(MAX_BODY), async (c) => {
      const parsed = removalSchema.safeParse(await readJson(c));
      if (!parsed.success)
        return apiError(c, 400, "invalid_input", "Send the device's push token.");
      const push = dependencies.push;
      if (!push) return apiError(c, 503, "not_configured", notConfigured);
      await push.remove(parsed.data.token);
      return c.body(null, 204);
    })
    .post("/api/push/test", jsonOnly, limitBody(MAX_BODY), signedIn, async (c) => {
      const push = dependencies.push;
      if (!push) return apiError(c, 503, "not_configured", notConfigured);
      const user = c.get("user");
      let limit;
      try {
        limit = await limiter.limit(`push-test:${user.id}`);
      } catch (error) {
        reportError(error, { message: "Rate limiter unavailable" });
        return apiError(c, 503, "unavailable", "Test notifications are unavailable right now.");
      }
      if (!limit.success) {
        const seconds = Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1_000));
        c.header("Retry-After", String(seconds));
        return apiError(c, 429, "rate_limited", "Too many test notifications. Try again later.");
      }
      let result: PushResult | null;
      try {
        result = await push.send(user, {
          title: siteConfig.name,
          body: "Notifications work on this device.",
          data: { url: "/" },
        });
      } catch (error) {
        reportError(error, { message: "Push notification failed" });
        return apiError(
          c,
          503,
          "unavailable",
          "The push service did not take the notification. Try again later.",
        );
      }
      if (!result) return apiError(c, 503, "not_configured", notConfigured);
      return c.json<components["schemas"]["PushTestResult"]>({
        sent: result.sent,
        removed: result.invalidTokens.length,
      });
    });
}

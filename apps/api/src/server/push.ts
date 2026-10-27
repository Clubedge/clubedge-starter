// Push notifications through Expo's push service, behind the provider-neutral PushProvider: the
// routes and the rest of the API only use the PushNotifications below. Expo delivers to the
// native app with the credentials EAS keeps for it, so the API needs none of its own.
import { z } from "zod";
import { createPushDevices, sendToUser, type PushProvider } from "@clubedge/push";
import { createExpoPush } from "@clubedge/push-expo";
import { optional, parseEnv } from "@/env";
import type { PushNotifications } from "@/routes/push";
import { getDb } from "./db";
import { getUserProfileId } from "./users";

const pushEnvSchema = z.object({
  // Only when the Expo project turns on enhanced push security.
  EXPO_ACCESS_TOKEN: optional(z.string()),
});

let provider: PushProvider | undefined;

function getProvider(): PushProvider {
  provider ??= createExpoPush({
    accessToken: parseEnv(pushEnvSchema, "Push notifications").EXPO_ACCESS_TOKEN || undefined,
  });
  return provider;
}

const devices = () => createPushDevices(getDb());

/** Sends one notification to each of the user's devices, such as from a background job. */
export const push: PushNotifications = {
  services: ["expo"],
  async register(user, device) {
    await devices().register(await getUserProfileId(user), device);
  },
  async remove(token) {
    await devices().remove(token);
  },
  async send(user, message) {
    return sendToUser(devices(), getProvider(), await getUserProfileId(user), message);
  },
};

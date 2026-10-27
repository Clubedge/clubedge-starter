// Push notifications straight through FCM (Android) and APNs (iOS), behind the provider-neutral
// PushProvider: the routes and the rest of the API only use the PushNotifications below. Each
// platform's devices get notifications once its credentials are set.
import { z } from "zod";
import { createPushDevices, sendToUser, type PushProvider } from "@clubedge/push";
import { createNativePush, type ApnsCredentials, type FcmCredentials } from "@clubedge/push-native";
import { optional, parseEnv } from "@/env";
import type { PushNotifications } from "@/routes/push";
import { getDb } from "@/server/db";
import { getUserProfileId } from "@/server/users";

const pushEnvSchema = z.object({
  // A Firebase service account's fields, for Android's devices.
  FCM_PROJECT_ID: optional(z.string()),
  FCM_CLIENT_EMAIL: optional(z.string()),
  FCM_PRIVATE_KEY: optional(z.string()),
  // An APNs authentication key (.p8), for Apple's devices.
  APNS_KEY_ID: optional(z.string()),
  APNS_TEAM_ID: optional(z.string()),
  APNS_PRIVATE_KEY: optional(z.string()),
  // The app's bundle identifier.
  APNS_TOPIC: optional(z.string()),
  // development for debug builds from Xcode; production for TestFlight and the App Store.
  APNS_ENVIRONMENT: optional(z.enum(["production", "development"])),
});

function credentials(): { fcm?: FcmCredentials; apns?: ApnsCredentials } {
  const env = parseEnv(pushEnvSchema, "Push notifications");
  return {
    ...(env.FCM_PROJECT_ID && env.FCM_CLIENT_EMAIL && env.FCM_PRIVATE_KEY
      ? {
          fcm: {
            projectId: env.FCM_PROJECT_ID,
            clientEmail: env.FCM_CLIENT_EMAIL,
            privateKey: env.FCM_PRIVATE_KEY,
          },
        }
      : {}),
    ...(env.APNS_KEY_ID && env.APNS_TEAM_ID && env.APNS_PRIVATE_KEY && env.APNS_TOPIC
      ? {
          apns: {
            keyId: env.APNS_KEY_ID,
            teamId: env.APNS_TEAM_ID,
            privateKey: env.APNS_PRIVATE_KEY,
            topic: env.APNS_TOPIC,
            production: env.APNS_ENVIRONMENT !== "development",
          },
        }
      : {}),
  };
}

let provider: PushProvider | undefined;

/** FCM and APNs, each when its credentials are set; null while neither is. */
function getProvider(): PushProvider | null {
  provider ??= createNativePush(credentials());
  return provider.services.length > 0 ? provider : null;
}

const devices = () => createPushDevices(getDb());

/** Sends one notification to each of the user's devices, such as from a background job. */
export const push: PushNotifications = {
  // Tokens are saved even before their service's credentials are set, and reached once they are.
  services: ["fcm", "apns"],
  async register(user, device) {
    await devices().register(await getUserProfileId(user), device);
  },
  async remove(token) {
    await devices().remove(token);
  },
  async send(user, message) {
    const sender = getProvider();
    if (!sender) return null;
    return sendToUser(devices(), sender, await getUserProfileId(user), message);
  },
};

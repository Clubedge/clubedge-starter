// This device's push token for FCM and APNs, which the API sends to directly: Android's FCM
// token, which needs Firebase's google-services.json in the build, or iOS's APNs device token.
import type { components } from "@clubedge/contract";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

/** A push token, with the service that delivers to it. */
export type PushToken = Pick<components["schemas"]["PushDevice"], "token" | "service">;

/** This device's push token, for the API to save. Throws while the app cannot have one. */
export async function pushToken(): Promise<PushToken> {
  const { data } = await Notifications.getDevicePushTokenAsync();
  return { token: String(data), service: Platform.OS === "ios" ? "apns" : "fcm" };
}

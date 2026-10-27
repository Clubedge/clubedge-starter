// This device's push token for Expo's push service: an Expo push token, which needs the EAS
// project the app is linked to (`eas init` writes its id into app.json).
import type { components } from "@clubedge/contract";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";

/** A push token, with the service that delivers to it. */
export type PushToken = Pick<components["schemas"]["PushDevice"], "token" | "service">;

/** This device's push token, for the API to save. Throws while the app cannot have one. */
export async function pushToken(): Promise<PushToken> {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    throw new Error(
      "Link the app to an EAS project first, which Expo's push service needs: run eas init in apps/mobile.",
    );
  }
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  return { token: data, service: "expo" };
}

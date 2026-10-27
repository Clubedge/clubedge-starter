// Expo's push service behind @clubedge/push's PushProvider. It delivers to the native app's Expo
// push tokens through FCM and APNs, with the credentials EAS keeps for the app, so the server
// needs none of its own: only an access token when the Expo project requires one.
import type { PushProvider, PushResult } from "@clubedge/push";

const SEND_URL = "https://exp.host/--/api/v2/push/send";
/** Expo takes up to 100 notifications per request. */
const BATCH_SIZE = 100;

/** Expo's answer for one notification, in the order they were sent. */
interface PushTicket {
  status: "ok" | "error";
  details?: { error?: string };
}

export class ExpoPushError extends Error {
  override name = "ExpoPushError";
}

export interface ExpoPushOptions {
  /** EXPO_ACCESS_TOKEN: needed when the Expo project turns on enhanced push security. */
  accessToken?: string;
  /** For tests: where to send, and how. */
  url?: string;
  fetch?: typeof fetch;
}

export function createExpoPush(options: ExpoPushOptions = {}): PushProvider {
  const send = options.fetch ?? fetch;
  return {
    id: "expo",
    services: ["expo"],
    async send(devices, message): Promise<PushResult> {
      const result: PushResult = { sent: 0, invalidTokens: [] };
      for (let start = 0; start < devices.length; start += BATCH_SIZE) {
        const batch = devices.slice(start, start + BATCH_SIZE);
        const response = await send(options.url ?? SEND_URL, {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            ...(options.accessToken ? { authorization: `Bearer ${options.accessToken}` } : {}),
          },
          body: JSON.stringify(
            batch.map(({ token }) => ({
              to: token,
              title: message.title,
              body: message.body,
              data: message.data ?? {},
              sound: "default",
              priority: "high",
            })),
          ),
        });
        if (!response.ok) {
          throw new ExpoPushError(`Expo's push service answered ${response.status}.`);
        }
        const { data } = (await response.json()) as { data?: PushTicket[] };
        batch.forEach(({ token }, index) => {
          const ticket = data?.[index];
          if (ticket?.status === "ok") result.sent += 1;
          // The app was uninstalled, or its token expired: it will never work again.
          else if (ticket?.details?.error === "DeviceNotRegistered")
            result.invalidTokens.push(token);
        });
      }
      return result;
    },
  };
}

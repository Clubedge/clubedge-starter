/**
 * The push service a device's token belongs to: Expo's push service for the native app's Expo
 * push tokens, Firebase Cloud Messaging for Android's, and APNs for Apple's.
 */
export type PushService = "expo" | "fcm" | "apns";

export const pushServices: readonly PushService[] = ["expo", "fcm", "apns"];

export type PushPlatform = "ios" | "android";

/** A device's push token, with the service it belongs to and the device's platform. */
export interface PushDevice {
  token: string;
  service: PushService;
  platform: PushPlatform;
}

/** A notification: a title, a text, and data the app reads when it is tapped. */
export interface PushMessage {
  title: string;
  body: string;
  /** String values only, as every service passes them. `url` opens that screen of the app. */
  data?: Record<string, string>;
}

/** What a send did. */
export interface PushResult {
  /** The devices the service took the notification for. */
  sent: number;
  /** Tokens the service says will never work again, such as an uninstalled app's. */
  invalidTokens: string[];
}

/**
 * One push service behind a provider-neutral interface: the rest of the API sends through
 * sendToUser, which reads the devices and forgets the tokens a service refuses for good.
 */
export interface PushProvider {
  id: string;
  /** The services whose tokens it sends to; tokens of others are left alone. */
  services: readonly PushService[];
  send(devices: PushDevice[], message: PushMessage): Promise<PushResult>;
}

/**
 * Whether `token` has the shape of a token of `service`, before it is saved: an Expo push token
 * (ExponentPushToken[...]), an FCM registration token, or an APNs device token in hex.
 */
export function isPushToken(service: PushService, token: string): boolean {
  if (token.length === 0 || token.length > 4_096) return false;
  switch (service) {
    case "expo":
      return /^Expo(nent)?PushToken\[[^\]\s]+\]$/.test(token);
    case "fcm":
      return /^[\w:.-]+$/.test(token);
    case "apns":
      return /^[0-9a-f]{64,200}$/i.test(token);
  }
}

// FCM and APNs behind @clubedge/push's PushProvider: notifications go straight to Google's and
// Apple's push services, with this server's own credentials, to the device tokens both mobile
// apps register (Firebase Cloud Messaging tokens on Android, APNs device tokens on iOS). Only
// Node.js's crypto, HTTP/2, and fetch are used.
import { sign } from "node:crypto";
import { connect, type ClientHttp2Session } from "node:http2";
import type {
  PushDevice,
  PushMessage,
  PushProvider,
  PushResult,
  PushService,
} from "@clubedge/push";

/** A Firebase service account's fields: Project settings, Service accounts, Generate new key. */
export interface FcmCredentials {
  projectId: string;
  clientEmail: string;
  /** The key in PEM; `\n` written as two characters, as env files often hold it, works too. */
  privateKey: string;
}

/** An APNs authentication key: Apple Developer, Keys, with Apple Push Notifications service. */
export interface ApnsCredentials {
  keyId: string;
  teamId: string;
  /** The .p8 file's content, in PEM. */
  privateKey: string;
  /** The app's bundle identifier. */
  topic: string;
  /** Apps built for the stores (TestFlight too) are in production; debug builds in the sandbox. */
  production: boolean;
}

export interface NativePushOptions {
  /** Android's devices, through FCM; without it, they get no notifications. */
  fcm?: FcmCredentials;
  /** Apple's devices, through APNs; without it, they get no notifications. */
  apns?: ApnsCredentials;
  /** For tests. */
  fetch?: typeof fetch;
  apnsOrigin?: string;
  now?: () => number;
}

export class NativePushError extends Error {
  override name = "NativePushError";
}

const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
/** Requests in flight at once, per service. */
const CONCURRENCY = 10;

const base64url = (value: string | Buffer) => Buffer.from(value).toString("base64url");

/** A JSON Web Token signed with RS256 (a Google service account) or ES256 (an APNs key). */
export function signJwt(
  header: { alg: "RS256" | "ES256"; [name: string]: string },
  claims: Record<string, string | number>,
  privateKey: string,
): string {
  const data = Buffer.from(
    `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`,
  );
  const key = privateKey.replace(/\\n/g, "\n");
  const signature =
    header.alg === "ES256"
      ? sign("sha256", data, { key, dsaEncoding: "ieee-p1363" })
      : sign("sha256", data, key);
  return `${data.toString()}.${base64url(signature)}`;
}

/** Runs `task` for each item, a few at a time. */
async function eachLimited<T>(items: T[], task: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await task(items[next++]!);
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
}

/**
 * The data the apps read when a notification is tapped, such as `url`. Each app finds it in its
 * own place: Capacitor in the payload's keys, Expo's notifications library in `body`, which FCM,
 * taking only strings, carries as JSON.
 */
function appData(message: PushMessage, service: "fcm" | "apns"): Record<string, unknown> {
  const data = message.data ?? {};
  return { ...data, body: service === "fcm" ? JSON.stringify(data) : data };
}

type Send = (devices: PushDevice[], message: PushMessage, result: PushResult) => Promise<void>;

function fcmSender(credentials: FcmCredentials, request: typeof fetch, now: () => number): Send {
  let cached: { token: string; expiresAt: number } | null = null;

  /** An OAuth access token for FCM, from the service account; Google's last for an hour. */
  async function accessToken(): Promise<string> {
    if (cached && cached.expiresAt - 60_000 > now()) return cached.token;
    const issuedAt = Math.floor(now() / 1_000);
    const assertion = signJwt(
      { alg: "RS256", typ: "JWT" },
      {
        iss: credentials.clientEmail,
        scope: FCM_SCOPE,
        aud: GOOGLE_TOKEN_URL,
        iat: issuedAt,
        exp: issuedAt + 3_600,
      },
      credentials.privateKey,
    );
    const response = await request(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });
    if (!response.ok) {
      throw new NativePushError(
        `Google refused the FCM service account (${response.status}): check FCM_CLIENT_EMAIL and FCM_PRIVATE_KEY.`,
      );
    }
    const body = (await response.json()) as { access_token: string; expires_in: number };
    cached = { token: body.access_token, expiresAt: now() + body.expires_in * 1_000 };
    return cached.token;
  }

  return async (devices, message, result) => {
    const authorization = `Bearer ${await accessToken()}`;
    const url = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(credentials.projectId)}/messages:send`;
    await eachLimited(devices, async ({ token }) => {
      const response = await request(url, {
        method: "POST",
        headers: { authorization, "content-type": "application/json" },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: message.title, body: message.body },
            data: appData(message, "fcm"),
            android: { priority: "HIGH" },
          },
        }),
      });
      if (response.ok) {
        result.sent += 1;
        return;
      }
      const code = await fcmErrorCode(response);
      // The app was uninstalled or its token expired (UNREGISTERED), or the token belongs to
      // another Firebase project (SENDER_ID_MISMATCH): it will never work here again.
      if (code === "UNREGISTERED" || code === "SENDER_ID_MISMATCH" || response.status === 404) {
        result.invalidTokens.push(token);
      } else if (response.status === 401 || response.status === 403) {
        throw new NativePushError(
          `FCM refused the request (${code ?? response.status}): check that the service account belongs to FCM_PROJECT_ID, whose Firebase Cloud Messaging API is on.`,
        );
      }
    });
  };
}

async function fcmErrorCode(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as {
      error?: { status?: string; details?: Array<{ errorCode?: string }> };
    };
    return body.error?.details?.find((detail) => detail.errorCode)?.errorCode ?? body.error?.status;
  } catch {
    return undefined;
  }
}

function apnsSender(
  credentials: ApnsCredentials,
  origin: string | undefined,
  now: () => number,
): Send {
  let cached: { token: string; issuedAt: number } | null = null;

  /**
   * The provider token APNs checks. It takes one for up to an hour, and refuses one renewed more
   * often than every 20 minutes, so it is kept for 50.
   */
  function providerToken(): string {
    if (cached && now() - cached.issuedAt < 50 * 60_000) return cached.token;
    const issuedAt = now();
    const token = signJwt(
      { alg: "ES256", kid: credentials.keyId },
      { iss: credentials.teamId, iat: Math.floor(issuedAt / 1_000) },
      credentials.privateKey,
    );
    cached = { token, issuedAt };
    return token;
  }

  const host =
    origin ??
    (credentials.production ? "https://api.push.apple.com" : "https://api.sandbox.push.apple.com");

  return async (devices, message, result) => {
    const session = connect(host);
    // A connection error fails each request, which reports it.
    session.on("error", () => {});
    try {
      const headers = { authorization: `bearer ${providerToken()}`, topic: credentials.topic };
      const payload = JSON.stringify({
        aps: { alert: { title: message.title, body: message.body }, sound: "default" },
        ...appData(message, "apns"),
      });
      await eachLimited(devices, async ({ token }) => {
        const { status, reason } = await apnsRequest(session, token, headers, payload);
        if (status === 200) result.sent += 1;
        // Uninstalled (410), or not a token of this app in this environment.
        else if (status === 410 || reason === "BadDeviceToken" || reason === "Unregistered") {
          result.invalidTokens.push(token);
        } else if (status === 403) {
          throw new NativePushError(
            `APNs refused the key (${reason ?? status}): check APNS_KEY_ID, APNS_TEAM_ID, and APNS_PRIVATE_KEY.`,
          );
        }
      });
    } finally {
      session.close();
    }
  };
}

function apnsRequest(
  session: ClientHttp2Session,
  token: string,
  headers: { authorization: string; topic: string },
  payload: string,
): Promise<{ status: number; reason?: string }> {
  return new Promise((resolve, reject) => {
    const request = session.request({
      ":method": "POST",
      ":path": `/3/device/${token}`,
      authorization: headers.authorization,
      "apns-topic": headers.topic,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    });
    let status = 0;
    let body = "";
    request.setEncoding("utf8");
    request.on("response", (response) => {
      status = Number(response[":status"]);
    });
    request.on("data", (chunk: string) => {
      body += chunk;
    });
    request.on("end", () => {
      let reason: string | undefined;
      try {
        reason = body ? (JSON.parse(body) as { reason?: string }).reason : undefined;
      } catch {
        reason = undefined;
      }
      resolve({ status, reason });
    });
    request.on("error", reject);
    request.end(payload);
  });
}

/**
 * FCM for Android and APNs for iOS, each when its credentials are set. A device whose service has
 * none is left out of sends, keeping its token for when it does.
 */
export function createNativePush(options: NativePushOptions): PushProvider {
  const now = options.now ?? Date.now;
  const senders = new Map<PushService, Send>();
  if (options.fcm) senders.set("fcm", fcmSender(options.fcm, options.fetch ?? fetch, now));
  if (options.apns) senders.set("apns", apnsSender(options.apns, options.apnsOrigin, now));
  return {
    id: "native",
    services: [...senders.keys()],
    async send(devices, message) {
      const result: PushResult = { sent: 0, invalidTokens: [] };
      for (const [service, send] of senders) {
        const own = devices.filter((device) => device.service === service);
        if (own.length) await send(own, message, result);
      }
      return result;
    },
  };
}

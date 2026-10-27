import { generateKeyPairSync, verify } from "node:crypto";
import { createServer, type Http2Server, type IncomingHttpHeaders } from "node:http2";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PushDevice } from "@clubedge/push";
import { createNativePush, NativePushError, signJwt } from "./index";

const pem = (key: { export(options: { type: "pkcs8"; format: "pem" }): string | Buffer }) =>
  key.export({ type: "pkcs8", format: "pem" }).toString();
const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
const ec = generateKeyPairSync("ec", { namedCurve: "P-256" });

const fcm = {
  projectId: "my-product",
  clientEmail: "push@my-product.iam.gserviceaccount.com",
  privateKey: pem(rsa.privateKey),
};
const message = { title: "Hello", body: "From the test", data: { url: "/settings" } };
const android = (token: string): PushDevice => ({ token, service: "fcm", platform: "android" });
const iphone = (token: string): PushDevice => ({
  token: token.padEnd(64, "0"),
  service: "apns",
  platform: "ios",
});

const decode = (part: string) =>
  JSON.parse(Buffer.from(part, "base64url").toString()) as Record<string, unknown>;

describe("signJwt", () => {
  it("signs with RS256 for Google, and ES256 for Apple, as their keys verify", () => {
    const google = signJwt({ alg: "RS256", typ: "JWT" }, { iss: "me" }, pem(rsa.privateKey)).split(
      ".",
    );
    expect(decode(google[0]!)).toEqual({ alg: "RS256", typ: "JWT" });
    expect(
      verify(
        "sha256",
        Buffer.from(`${google[0]}.${google[1]}`),
        rsa.publicKey,
        Buffer.from(google[2]!, "base64url"),
      ),
    ).toBe(true);

    const apple = signJwt(
      { alg: "ES256", kid: "KEY" },
      { iss: "TEAM", iat: 1 },
      pem(ec.privateKey),
    ).split(".");
    const signature = Buffer.from(apple[2]!, "base64url");
    // A raw signature, r and s side by side, as JSON Web Tokens hold it.
    expect(signature).toHaveLength(64);
    expect(
      verify(
        "sha256",
        Buffer.from(`${apple[0]}.${apple[1]}`),
        { key: ec.publicKey, dsaEncoding: "ieee-p1363" },
        signature,
      ),
    ).toBe(true);
  });

  it("reads a key whose line breaks are written as \\n, as env files hold it", () => {
    const flat = pem(rsa.privateKey).replace(/\n/g, "\\n");
    expect(() => signJwt({ alg: "RS256" }, { iss: "me" }, flat)).not.toThrow();
  });
});

describe("FCM", () => {
  /** Google's token endpoint and FCM, which refuses the tokens named "gone". */
  function google(
    answer: (token: string) => Response = () => Response.json({ name: "projects/x/messages/1" }),
  ) {
    return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url) === "https://oauth2.googleapis.com/token") {
        return Response.json({ access_token: "access", expires_in: 3600 });
      }
      return answer(
        (JSON.parse(String(init?.body)) as { message: { token: string } }).message.token,
      );
    });
  }

  it("sends each device its notification, with the service account's access token", async () => {
    const fetch = google();
    const push = createNativePush({ fcm, fetch });
    expect(push.services).toEqual(["fcm"]);
    expect(await push.send([android("one"), android("two")], message)).toEqual({
      sent: 2,
      invalidTokens: [],
    });

    const [tokenUrl, tokenInit] = fetch.mock.calls[0]!;
    expect(tokenUrl).toBe("https://oauth2.googleapis.com/token");
    const assertion = new URLSearchParams(String(tokenInit?.body)).get("assertion")!;
    expect(decode(assertion.split(".")[1]!)).toMatchObject({
      iss: fcm.clientEmail,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
    });
    const [sendUrl, sendInit] = fetch.mock.calls[1]!;
    expect(sendUrl).toBe("https://fcm.googleapis.com/v1/projects/my-product/messages:send");
    expect(new Headers(sendInit?.headers).get("authorization")).toBe("Bearer access");
    expect(JSON.parse(String(sendInit?.body))).toEqual({
      message: {
        token: "one",
        notification: { title: "Hello", body: "From the test" },
        data: { url: "/settings", body: '{"url":"/settings"}' },
        android: { priority: "HIGH" },
      },
    });
  });

  it("keeps the access token until it nearly expires", async () => {
    let now = 0;
    const fetch = google();
    const push = createNativePush({ fcm, fetch, now: () => now });
    await push.send([android("one")], message);
    now = 30 * 60_000;
    await push.send([android("one")], message);
    const tokenRequests = () =>
      fetch.mock.calls.filter(([url]) => String(url).includes("oauth2")).length;
    expect(tokenRequests()).toBe(1);
    now = 59.5 * 60_000;
    await push.send([android("one")], message);
    expect(tokenRequests()).toBe(2);
  });

  it("names the tokens FCM no longer knows, and keeps those it refuses for now", async () => {
    const fetch = google((token) =>
      token === "gone"
        ? Response.json(
            { error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } },
            { status: 404 },
          )
        : token === "busy"
          ? Response.json({ error: { status: "UNAVAILABLE" } }, { status: 503 })
          : Response.json({ name: "ok" }),
    );
    const result = await createNativePush({ fcm, fetch }).send(
      [android("one"), android("gone"), android("busy")],
      message,
    );
    expect(result).toEqual({ sent: 1, invalidTokens: ["gone"] });
  });

  it("fails clearly when Google refuses the service account", async () => {
    const fetch = vi.fn(async () => Response.json({ error: "invalid_grant" }, { status: 400 }));
    await expect(createNativePush({ fcm, fetch }).send([android("one")], message)).rejects.toThrow(
      new NativePushError(
        "Google refused the FCM service account (400): check FCM_CLIENT_EMAIL and FCM_PRIVATE_KEY.",
      ),
    );
  });
});

describe("APNs", () => {
  let server: Http2Server | undefined;

  afterEach(async () => {
    await new Promise((resolve) => (server ? server.close(resolve) : resolve(undefined)));
    server = undefined;
  });

  /** A local HTTP/2 server in APNs' place: it refuses tokens starting with "dead". */
  async function apple() {
    const requests: Array<{ headers: IncomingHttpHeaders; body: string }> = [];
    server = createServer((request, response) => {
      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk: string) => (body += chunk));
      request.on("end", () => {
        requests.push({ headers: request.headers, body });
        if (request.headers[":path"]!.startsWith("/3/device/dead")) {
          response.writeHead(410, { "content-type": "application/json" });
          response.end(JSON.stringify({ reason: "Unregistered" }));
        } else {
          response.writeHead(200);
          response.end();
        }
      });
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    return { origin: `http://127.0.0.1:${(server!.address() as AddressInfo).port}`, requests };
  }

  const apns = {
    keyId: "KEY123",
    teamId: "TEAM456",
    privateKey: pem(ec.privateKey),
    topic: "com.example.app",
    production: true,
  };

  it("sends each device an alert for the app, with the key's provider token", async () => {
    const { origin, requests } = await apple();
    const push = createNativePush({ apns, apnsOrigin: origin });
    expect(push.services).toEqual(["apns"]);
    expect(await push.send([iphone("abc"), iphone("dead")], message)).toEqual({
      sent: 1,
      invalidTokens: [iphone("dead").token],
    });

    const sent = requests.find(
      ({ headers }) => headers[":path"] === `/3/device/${iphone("abc").token}`,
    )!;
    expect(sent.headers).toMatchObject({
      ":method": "POST",
      "apns-topic": "com.example.app",
      "apns-push-type": "alert",
      "apns-priority": "10",
    });
    const [header, claims] = String(sent.headers.authorization)
      .replace(/^bearer /, "")
      .split(".");
    expect(decode(header!)).toEqual({ alg: "ES256", kid: "KEY123" });
    expect(decode(claims!)).toMatchObject({ iss: "TEAM456" });
    expect(JSON.parse(sent.body)).toEqual({
      aps: { alert: { title: "Hello", body: "From the test" }, sound: "default" },
      url: "/settings",
      body: { url: "/settings" },
    });
  });

  it("sends each service its own devices, and none to a service without credentials", async () => {
    const { origin, requests } = await apple();
    const fetch = vi.fn(async (url: string | URL | Request) =>
      String(url).includes("oauth2")
        ? Response.json({ access_token: "a", expires_in: 3600 })
        : Response.json({}),
    );
    const both = createNativePush({ fcm, apns, fetch, apnsOrigin: origin });
    expect(await both.send([android("one"), iphone("abc")], message)).toEqual({
      sent: 2,
      invalidTokens: [],
    });
    expect(requests).toHaveLength(1);

    const androidOnly = createNativePush({ fcm, fetch });
    expect(androidOnly.services).toEqual(["fcm"]);
    expect(await androidOnly.send([iphone("abc")], message)).toEqual({
      sent: 0,
      invalidTokens: [],
    });
  });
});

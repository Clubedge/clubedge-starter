import { spawn, type ChildProcess } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer, request, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { webOrigin } from "../apps/capacitor/scripts/build.mjs";
import { iconArguments, makeAndroidSplash, makeIcons } from "../apps/capacitor/scripts/icons.mjs";
import { delegateWithPush, projectWithEntitlements } from "../apps/capacitor/scripts/push.mjs";
import {
  buildNumber as shellBuildNumber,
  isNewer,
  nativeVersion,
  versionGradle,
  versionXcodeProject,
} from "../apps/capacitor/scripts/version.mjs";
import { buildNumber as nativeBuildNumber } from "../apps/expo/app.config";
import { buildNumber as setVersionBuildNumber } from "../apps/expo/scripts/set-version.mjs";

// The mobile apps call the API through the website's Node server (apps/vite/server.mjs): the
// shell (apps/capacitor) from origins of its own, and the native app (apps/expo) with no origin,
// as native requests have none. The server runs here from a copy, as the production image runs
// it, next to stand-ins for the API and for Better Auth's bundle.

const appOrigins = ["capacitor://localhost", "https://localhost"];
let api: Server;
let frontend: ChildProcess;
let port = 0;
let directory = "";
/** The headers of the last request the API received. */
let forwarded: IncomingHttpHeaders = {};

function listen(server: Server) {
  return new Promise<number>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve((server.address() as AddressInfo).port)),
  );
}

function send(method: string, path: string, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; headers: IncomingHttpHeaders }>((resolve, reject) => {
    const outgoing = request({ host: "127.0.0.1", port, method, path, headers }, (response) => {
      response.resume();
      response.on("end", () =>
        resolve({ status: response.statusCode!, headers: response.headers }),
      );
    });
    outgoing.on("error", reject);
    outgoing.end();
  });
}

beforeAll(async () => {
  // The API answers with CORS headers of its own, which the app must never see.
  api = createServer((incoming, response) => {
    forwarded = incoming.headers;
    response.writeHead(200, {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-credentials": "true",
      vary: "Accept-Encoding",
    });
    response.end(JSON.stringify({ user: null }));
  });
  const apiPort = await listen(api);

  directory = mkdtempSync(join(tmpdir(), "clubedge-frontend-"));
  copyFileSync("apps/vite/server.mjs", join(directory, "server.mjs"));
  copyFileSync("apps/vite/client-ip.mjs", join(directory, "client-ip.mjs"));
  mkdirSync(join(directory, "dist"));
  writeFileSync(join(directory, "dist/index.html"), "<!doctype html>");
  // Better Auth, with its bearer plugin, as it answers a sign-in. It also says which session
  // cookie and app scheme it received.
  writeFileSync(
    join(directory, "dist/auth.server.mjs"),
    `export async function serveAuthRequest(request, response) {
      response.writeHead(200, {
        "content-type": "application/json",
        "x-received-cookie": request.headers.cookie ?? "",
        "x-received-expo-origin": request.headers["expo-origin"] ?? "",
        "set-auth-token": "token.signature",
        "access-control-expose-headers": "set-auth-token",
        "set-cookie": ["better-auth.session_token=token.signature; Path=/; HttpOnly"],
      });
      response.end("{}");
    }`,
  );

  // A free port for the server, which reads it from PORT.
  const probe = createServer();
  port = await listen(probe);
  await new Promise((resolve) => probe.close(resolve));
  frontend = spawn(process.execPath, ["server.mjs"], {
    cwd: directory,
    env: {
      ...process.env,
      PORT: String(port),
      API_URL: `http://127.0.0.1:${apiPort}`,
      MOBILE_ORIGINS: appOrigins.join(","),
    },
  });
  await new Promise<void>((resolve, reject) => {
    frontend.stdout!.on("data", (chunk: Buffer) => {
      if (chunk.toString().includes("listening")) resolve();
    });
    frontend.on("exit", (code) => reject(new Error(`server.mjs exited with ${code}`)));
  });
});

afterAll(async () => {
  // The server's folder can only be removed once it has stopped (Windows keeps it while in use).
  if (frontend && frontend.exitCode === null) {
    const stopped = new Promise((resolve) => frontend.once("exit", resolve));
    frontend.kill();
    await stopped;
  }
  await new Promise((resolve) => api?.close(resolve));
  if (directory) rmSync(directory, { recursive: true, force: true });
});

describe("apps/vite/server.mjs for the mobile app's origins", () => {
  it("answers the app's preflights for the forwarded routes and Better Auth's", async () => {
    for (const [origin, method, path] of [
      ["capacitor://localhost", "GET", "/api/session"],
      ["https://localhost", "POST", "/api/account/profile"],
      ["https://localhost", "POST", "/api/auth/sign-in/email"],
    ]) {
      const response = await send("OPTIONS", path!, {
        origin: origin!,
        "access-control-request-method": method!,
        "access-control-request-headers": "authorization, content-type",
      });
      expect(response.status, path).toBe(204);
      expect(response.headers).toMatchObject({
        "access-control-allow-origin": origin,
        "access-control-allow-headers":
          "authorization, content-type, x-app-version, x-app-platform",
        "access-control-max-age": "600",
        vary: "Origin",
      });
      expect(response.headers["access-control-allow-methods"]).toContain(method);
      expect(response.headers["access-control-allow-credentials"]).toBeUndefined();
    }
  });

  it("answers no preflight for a route it does not forward", async () => {
    const response = await send("OPTIONS", "/api/admin", {
      origin: "https://localhost",
      "access-control-request-method": "DELETE",
    });
    expect(response.status).toBe(404);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("gives the app's requests CORS headers in place of the API's, and forwards its token", async () => {
    const response = await send("GET", "/api/session", {
      origin: "https://localhost",
      authorization: "Bearer token.signature",
    });
    expect(response.status).toBe(200);
    expect(forwarded.authorization).toBe("Bearer token.signature");
    expect(response.headers).toMatchObject({
      "access-control-allow-origin": "https://localhost",
      "access-control-expose-headers": "set-auth-token",
      vary: "Accept-Encoding, Origin",
    });
    expect(response.headers["access-control-allow-credentials"]).toBeUndefined();
  });

  it("leaves the answers to other origins as the API sent them", async () => {
    const response = await send("GET", "/api/session", { origin: "https://elsewhere.example" });
    expect(response.headers).toMatchObject({
      "access-control-allow-origin": "*",
      "access-control-allow-credentials": "true",
      vary: "Accept-Encoding",
    });
  });

  it("gives the session token to the app, and to the website's pages only as a cookie", async () => {
    const app = await send("POST", "/api/auth/sign-in/email", { origin: "capacitor://localhost" });
    expect(app.headers["set-auth-token"]).toBe("token.signature");
    expect(app.headers["access-control-expose-headers"]).toBe("set-auth-token");

    const website = await send("POST", "/api/auth/sign-in/email", {
      origin: "https://app.example.com",
    });
    expect(website.headers["set-auth-token"]).toBeUndefined();
    expect(website.headers["access-control-expose-headers"]).toBeUndefined();
    expect(website.headers["set-cookie"]).toEqual([
      "better-auth.session_token=token.signature; Path=/; HttpOnly",
    ]);
  });
});

describe("apps/vite/server.mjs for the native app, which sends no origin", () => {
  it("passes its session cookie and its scheme to Better Auth, and the new cookie back", async () => {
    const response = await send("POST", "/api/auth/sign-in/email", {
      cookie: "better-auth.session_token=old.signature",
      "expo-origin": "my-product://",
    });
    expect(response.headers["x-received-cookie"]).toBe("better-auth.session_token=old.signature");
    expect(response.headers["x-received-expo-origin"]).toBe("my-product://");
    expect(response.headers["set-cookie"]).toEqual([
      "better-auth.session_token=token.signature; Path=/; HttpOnly",
    ]);
    // Without a browser origin, no CORS headers, and the shell's bearer token stays out.
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    expect(response.headers["set-auth-token"]).toBeUndefined();
  });

  it("forwards its session cookie to the API", async () => {
    const response = await send("GET", "/api/session", {
      cookie: "better-auth.session_token=token.signature",
    });
    expect(response.status).toBe(200);
    expect(forwarded.cookie).toBe("better-auth.session_token=token.signature");
  });
});

describe("apps/capacitor/scripts/build.mjs", () => {
  it("builds the app for the website's https origin", () => {
    expect(webOrigin("https://app.example.com")).toBe("https://app.example.com");
    expect(webOrigin("https://App.Example.com:8443/")).toBe("https://app.example.com:8443");
  });

  it("refuses a WEB_URL the app cannot use", () => {
    expect(() => webOrigin(undefined)).toThrow("Set WEB_URL");
    expect(() => webOrigin("")).toThrow("Set WEB_URL");
    expect(() => webOrigin("app.example.com")).toThrow("must be the website's address");
    expect(() => webOrigin("http://app.example.com")).toThrow("https://");
    expect(() => webOrigin("https://app.example.com/app")).toThrow("must be an origin");
    expect(() => webOrigin("https://user:secret@app.example.com")).toThrow("must be an origin");
  });
});

describe("apps/capacitor/scripts/icons.mjs", () => {
  it("makes each platform's icons from the shell's own art, with a pinned asset tool", () => {
    const args = iconArguments("android");
    expect(args.slice(0, 4)).toEqual(["--yes", "@capacitor/assets@3.0.5", "generate", "--android"]);
    // The art is apps/shell/assets/logo.svg in a project, which the tool finds by name.
    const assetPath = args[args.indexOf("--assetPath") + 1]!.replaceAll("\\", "/");
    expect(assetPath).toBe("assets");
    expect(iconArguments("ios")).toContain("--ios");
  });

  it("refuses a platform whose native project does not exist yet", () => {
    // The asset tool would skip it and still succeed, so this fails before running the tool.
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(makeIcons("android")).toBe(false);
    expect(error).toHaveBeenCalledWith(
      "The app has no android project yet: run pnpm android to create it.",
    );
    error.mockRestore();
  });

  describe("makeAndroidSplash", () => {
    // Capacitor's launch theme, as cap add writes it.
    const launchTheme = [
      '    <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">',
      '        <item name="android:background">@drawable/splash</item>',
      "    </style>",
    ];
    let android = "";
    const resources = () => join(android, "app/src/main/res");
    const styles = () => readFileSync(join(resources(), "values/styles.xml"), "utf8");

    function project(theme: string[], newline = "\n") {
      android = mkdtempSync(join(tmpdir(), "clubedge-android-"));
      mkdirSync(join(resources(), "values"), { recursive: true });
      const lines = [
        '<?xml version="1.0" encoding="utf-8"?>',
        "<resources>",
        ...theme,
        "</resources>",
      ];
      writeFileSync(join(resources(), "values/styles.xml"), lines.join(newline) + newline);
    }

    afterEach(() => rmSync(android, { recursive: true, force: true }));

    it("draws the mark in the middle of the background, which nothing stretches", () => {
      project(launchTheme);
      expect(makeAndroidSplash(android)).toBe(true);
      expect(styles()).toContain(
        [
          '        <item name="android:background">@drawable/splash_screen</item>',
          '        <item name="windowSplashScreenBackground">@color/splash_screen_background</item>',
          '        <item name="windowSplashScreenAnimatedIcon">@drawable/splash_screen_icon</item>',
        ].join("\n"),
      );
      expect(existsSync(join(resources(), "drawable-nodpi/splash_icon.png"))).toBe(true);
      const icon = readFileSync(join(resources(), "drawable/splash_screen_icon.xml"), "utf8");
      expect(icon).toContain('android:width="128dp"');
      expect(readFileSync(join(resources(), "values-night/splash_screen.xml"), "utf8")).toContain(
        "#151515",
      );
    });

    it("changes the launch theme once, keeping its line endings", () => {
      project(launchTheme, "\r\n");
      makeAndroidSplash(android);
      const once = styles();
      makeAndroidSplash(android);
      expect(styles()).toBe(once);
      expect(once.match(/windowSplashScreenAnimatedIcon/g)).toHaveLength(1);
      expect(once.replaceAll("\r\n", "")).not.toContain("\n");
    });

    it("leaves a launch theme of the app's own as it is", () => {
      const own = ['    <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen" />'];
      project(own);
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      expect(makeAndroidSplash(android)).toBe(false);
      expect(styles()).not.toContain("splash_screen");
      warn.mockRestore();
    });
  });
});

describe("the store builds' versions", () => {
  it("gives a version the same build number in both apps, which grows with the version", () => {
    for (const buildNumber of [nativeBuildNumber, setVersionBuildNumber, shellBuildNumber]) {
      expect(buildNumber("1.4.2")).toBe(1_004_002);
    }
    expect(shellBuildNumber("1.10.0")).toBeGreaterThan(shellBuildNumber("1.9.999"));
    expect(isNewer("1.10.0", "1.9.999")).toBe(true);
    expect(isNewer("1.4.2", "1.4.2")).toBe(false);
    expect(() => nativeBuildNumber("1.4")).toThrow("must be major.minor.patch");
    expect(() => nativeBuildNumber("1.1000.0")).toThrow("too large for a build number");
  });

  it("starts both apps at 1.0.0", () => {
    const read = (file: string) => JSON.parse(readFileSync(new URL(file, import.meta.url), "utf8"));
    expect(read("../apps/expo/app.json").expo.version).toBe("1.0.0");
    expect(read("../apps/capacitor/version.json").version).toBe("1.0.0");
  });

  it("writes the version into the shell's Android and Xcode projects, as cap add writes them", () => {
    const gradle = 'defaultConfig {\n    versionCode 1\n    versionName "1.0"\n}\n';
    expect(versionGradle(gradle, "1.4.2")).toBe(
      'defaultConfig {\n    versionCode 1004002\n    versionName "1.4.2"\n}\n',
    );
    expect(versionGradle('versionCode = 1\nversionName = "1.0"', "2.0.1")).toBe(
      'versionCode = 2000001\nversionName = "2.0.1"',
    );
    // What a build compares with version.json, so it never takes a project's version back.
    expect(nativeVersion(gradle)).toBe("1.0");
    expect(nativeVersion("MARKETING_VERSION = 1.3.0;")).toBe("1.3.0");
    const xcode = "CURRENT_PROJECT_VERSION = 1;\nMARKETING_VERSION = 1.0;\n".repeat(2);
    expect(versionXcodeProject(xcode, "1.4.2")).toBe(
      "CURRENT_PROJECT_VERSION = 1004002;\nMARKETING_VERSION = 1.4.2;\n".repeat(2),
    );
  });
});

describe("apps/capacitor/scripts/push.mjs", () => {
  // The app delegate and the project's build settings, as cap add writes them.
  const delegate = [
    "import UIKit",
    "import Capacitor",
    "",
    "@UIApplicationMain",
    "class AppDelegate: UIResponder, UIApplicationDelegate {",
    "    var window: UIWindow?",
    "}",
    "",
  ].join("\n");

  it("passes APNs' answer to the push plugin, once", () => {
    const once = delegateWithPush(delegate);
    expect(once).toContain("didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data");
    expect(once).toContain("name: .capacitorDidFailToRegisterForRemoteNotifications");
    expect(once.trimEnd().endsWith("}")).toBe(true);
    expect(delegateWithPush(once)).toBe(once);
  });

  it("gives each of the app's configurations its entitlements, once", () => {
    const settings = "\t\t\t\tINFOPLIST_FILE = App/Info.plist;\n".repeat(2);
    const once = projectWithEntitlements(settings);
    expect(once.match(/CODE_SIGN_ENTITLEMENTS = App\/App\.entitlements;/g)).toHaveLength(2);
    expect(projectWithEntitlements(once)).toBe(once);
  });
});

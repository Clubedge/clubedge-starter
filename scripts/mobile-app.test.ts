import { spawn, type ChildProcess } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, request, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { webOrigin } from "../apps/capacitor/scripts/build.mjs";
import { iconArguments, makeIcons } from "../apps/capacitor/scripts/icons.mjs";

// The mobile app (apps/capacitor) calls the API through the website's Node server
// (apps/vite/server.mjs), from origins of its own. The server runs here from a copy, as the
// production image runs it, next to stand-ins for the API and for Better Auth's bundle.

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
  // Better Auth, with its bearer plugin, as it answers a sign-in.
  writeFileSync(
    join(directory, "dist/auth.server.mjs"),
    `export async function serveAuthRequest(request, response) {
      response.writeHead(200, {
        "content-type": "application/json",
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
        "access-control-allow-headers": "authorization, content-type",
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
  it("makes each platform's icons from the web app's logo, with a pinned asset tool", () => {
    const args = iconArguments("android");
    expect(args.slice(0, 4)).toEqual(["--yes", "@capacitor/assets@3.0.5", "generate", "--android"]);
    // The logo is apps/web/public/.well-known/logo.svg in a project, which the tool finds by name.
    const assetPath = args[args.indexOf("--assetPath") + 1]!.replaceAll("\\", "/");
    expect(assetPath).toBe("../web/public/.well-known");
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
});

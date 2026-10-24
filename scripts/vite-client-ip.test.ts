import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer, request, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { getClientIp, parseClientIpSettings } from "../packages/core/src/client-ip";
import * as vite from "../apps/vite/client-ip.mjs";

// The Vite frontend's Node server runs without the workspace packages, so apps/vite/client-ip.mjs
// repeats @clubedge/core's rules for the client's address; both must give the same answers. The
// server sends the API the address it finds as the one x-forwarded-for entry, which the API
// trusts (TRUSTED_PROXY_HOPS=1), so no address a client claims may reach the API.

type Env = Record<string, string>;

describe("apps/vite/client-ip.mjs", () => {
  it("finds the client's address as @clubedge/core does", () => {
    const socketAddress = "192.0.2.10";
    const cases: Array<[Record<string, string>, Parameters<typeof getClientIp>[1]]> = [
      [{ "x-forwarded-for": "198.51.100.66, 203.0.113.1" }, { socketAddress }],
      [{ "x-forwarded-for": "198.51.100.66, 203.0.113.1" }, { trustedHops: 1, socketAddress }],
      [{ "x-forwarded-for": "198.51.100.66, 203.0.113.1, 10.0.0.2" }, { trustedHops: 2 }],
      [{ "x-forwarded-for": "203.0.113.1" }, { trustedHops: 2, socketAddress }],
      [{ "x-forwarded-for": "203.0.113.1" }, { trustedHops: 2 }],
      [{ "fly-client-ip": "203.0.113.7, 10.0.0.2" }, { header: "fly-client-ip", trustedHops: 1 }],
      [{ "x-forwarded-for": "203.0.113.1" }, { header: "fly-client-ip", socketAddress }],
      [{ "x-forwarded-for": "a".repeat(100) }, { trustedHops: 1 }],
      [{}, {}],
    ];
    for (const [headers, options] of cases) {
      expect(vite.getClientIp(headers, options), JSON.stringify([headers, options])).toBe(
        getClientIp(new Headers(headers), options),
      );
    }
  });

  it("reads and refuses CLIENT_IP_HEADER and TRUSTED_PROXY_HOPS as @clubedge/core does", () => {
    const outcome = (parse: (env: Env) => unknown, env: Env) => {
      try {
        return parse(env);
      } catch (error) {
        return (error as Error).message;
      }
    };
    const settings: Env[] = [
      {},
      { CLIENT_IP_HEADER: "", TRUSTED_PROXY_HOPS: "" },
      { CLIENT_IP_HEADER: " Fly-Client-IP ", TRUSTED_PROXY_HOPS: "2" },
      { CLIENT_IP_HEADER: "x real ip" },
      { TRUSTED_PROXY_HOPS: "-1" },
      { TRUSTED_PROXY_HOPS: "11" },
    ];
    for (const env of settings) {
      expect(outcome(vite.parseClientIpSettings, env)).toEqual(outcome(parseClientIpSettings, env));
    }
  });
});

describe("apps/vite/server.mjs", () => {
  const stops: Array<() => void> = [];
  afterEach(() => {
    for (const stop of stops.splice(0)) stop();
  });

  /** Starts server.mjs with `env`, collecting what it prints. */
  function startServer(env: Env) {
    const server = spawn(
      process.execPath,
      [fileURLToPath(new URL("../apps/vite/server.mjs", import.meta.url))],
      { env: { ...process.env, CLIENT_IP_HEADER: "", TRUSTED_PROXY_HOPS: "", PORT: "0", ...env } },
    );
    stops.push(() => server.kill());
    const output = { stdout: "", stderr: "" };
    server.stdout.on("data", (chunk) => (output.stdout += chunk));
    server.stderr.on("data", (chunk) => (output.stderr += chunk));
    return { server, output };
  }

  /** server.mjs in front of a stand-in API, which answers with the headers it received. */
  async function startGateway(env: Env = {}) {
    const api = createServer((incoming, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(incoming.headers));
    });
    api.listen(0, "127.0.0.1");
    await once(api, "listening");
    stops.push(() => api.close());
    const apiUrl = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;
    const { server, output } = startServer({ ...env, API_URL: apiUrl });
    // It prints the port it bound once it listens.
    return new Promise<number>((resolve, reject) => {
      server.stdout.on("data", () => {
        const port = /listening on port (\d+)/.exec(output.stdout)?.[1];
        if (port) resolve(Number(port));
      });
      server.on("close", () => reject(new Error(`server.mjs stopped: ${output.stderr}`)));
    });
  }

  /** The headers the API receives for a request to the frontend with `headers`. */
  function received(port: number, headers: Record<string, string>) {
    return new Promise<IncomingHttpHeaders>((resolve, reject) => {
      request({ host: "127.0.0.1", port, path: "/api/health", headers }, (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => (body += chunk));
        response.on("end", () => resolve(JSON.parse(body)));
      })
        .on("error", reject)
        .end();
    });
  }

  // Every header a client could use to claim an address.
  const claims = {
    "x-forwarded-for": "198.51.100.1",
    "x-real-ip": "198.51.100.2",
    forwarded: "for=198.51.100.3",
    "true-client-ip": "198.51.100.4",
    "cf-connecting-ip": "198.51.100.5",
    "fly-client-ip": "198.51.100.6",
    "x-nf-client-connection-ip": "198.51.100.7",
  };

  it("forwards the connection's address alone, and none of the client's claims", async () => {
    const headers = await received(await startGateway(), { ...claims, "x-request-id": "kept" });
    expect(headers["x-forwarded-for"]).toBe("127.0.0.1");
    for (const name of Object.keys(claims).filter((name) => name !== "x-forwarded-for")) {
      expect(headers[name], name).toBeUndefined();
    }
    expect(headers["x-request-id"]).toBe("kept");
  });

  it("forwards the entry its own trusted proxy added", async () => {
    const port = await startGateway({ TRUSTED_PROXY_HOPS: "1" });
    const headers = await received(port, { "x-forwarded-for": "198.51.100.1, 203.0.113.1" });
    expect(headers["x-forwarded-for"]).toBe("203.0.113.1");
  });

  it("forwards the address in the host's header, and never the header itself", async () => {
    const port = await startGateway({ CLIENT_IP_HEADER: "X-Client-Address" });
    const headers = await received(port, { ...claims, "x-client-address": "203.0.113.9" });
    expect(headers["x-forwarded-for"]).toBe("203.0.113.9");
    expect(headers["x-client-address"]).toBeUndefined();
  });

  it("refuses to start with a setting that cannot be right", async () => {
    const { server, output } = startServer({ TRUSTED_PROXY_HOPS: "two" });
    const [code] = await once(server, "close");
    expect(code).not.toBe(0);
    expect(output.stderr).toContain(
      'TRUSTED_PROXY_HOPS must be a whole number from 0 to 10, not "two"',
    );
  });
});

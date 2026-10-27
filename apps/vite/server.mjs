import { createReadStream, promises as fs } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { clientIp, clientIpSettings } from "./client-ip.mjs";

const root = resolve(fileURLToPath(new URL("./dist/", import.meta.url)));
const configuredApiUrl = process.env.API_URL;
const apiTarget = configuredApiUrl ? new URL(configuredApiUrl) : undefined;
if (
  apiTarget &&
  (!["http:", "https:"].includes(apiTarget.protocol) ||
    apiTarget.username ||
    apiTarget.password ||
    apiTarget.pathname !== "/" ||
    apiTarget.search ||
    apiTarget.hash)
) {
  throw new Error("API_URL must be an HTTP(S) origin without credentials, a path, or query.");
}
// Only these contract endpoints are proxied. The upstream host comes from API_URL; request
// input can select a fixed path and add a query string, but can never supply the request URL.
const apiRoutes = new Map([
  ["GET /api/health", "/api/health"],
  ["GET /api/ready", "/api/ready"],
  ["GET /api/session", "/api/session"],
  ["GET /api/app-version", "/api/app-version"],
  ["GET /api/account", "/api/account"], // clubedge:only auth!=none
  ["POST /api/account/profile", "/api/account/profile"], // clubedge:only auth!=none
  ["POST /api/account/delete", "/api/account/delete"], // clubedge:only auth!=none
  ["GET /api/client-errors", "/api/client-errors"], // clubedge:only observability!=none
  ["POST /api/client-errors", "/api/client-errors"], // clubedge:only observability!=none
  ["GET /api/jobs", "/api/jobs"], // clubedge:only jobs!=none
  ["POST /api/jobs/sample", "/api/jobs/sample"], // clubedge:only jobs!=none
  ["GET /api/jobs/run", "/api/jobs/run"], // clubedge:only jobs=pg-boss|bullmq
  ["GET /api/inngest", "/api/inngest"], // clubedge:only jobs=inngest
  ["PUT /api/inngest", "/api/inngest"], // clubedge:only jobs=inngest
  ["POST /api/inngest", "/api/inngest"], // clubedge:only jobs=inngest
  ["GET /api/billing", "/api/billing"], // clubedge:only payments=stripe
  ["POST /api/billing/checkout", "/api/billing/checkout"], // clubedge:only payments=stripe
  ["POST /api/billing/portal", "/api/billing/portal"], // clubedge:only payments=stripe
  ["POST /api/webhooks/payments", "/api/webhooks/payments"], // clubedge:only payments=stripe
  ["POST /api/push/devices", "/api/push/devices"], // clubedge:only push!=none
  ["POST /api/push/devices/remove", "/api/push/devices/remove"], // clubedge:only push!=none
  ["POST /api/push/test", "/api/push/test"], // clubedge:only push!=none
]);
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};
const hopByHopHeaders = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);
// Headers a client could use to claim an address. The API takes the client's address from the
// one x-forwarded-for entry this server sends (TRUSTED_PROXY_HOPS=1), so it never gets these.
const addressHeaders = new Set([
  "x-forwarded-for",
  "x-real-ip",
  "forwarded",
  "true-client-ip",
  "cf-connecting-ip",
  "fly-client-ip",
  "x-nf-client-connection-ip",
]);
if (clientIpSettings.header) addressHeaders.add(clientIpSettings.header);

function proxy(request, response) {
  if (!apiTarget) {
    response.writeHead(503, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "API_URL is not configured." }));
    return;
  }

  let upstreamPath;
  let search = "";
  try {
    const requestUrl = new URL(request.url ?? "/", "http://frontend.invalid");
    upstreamPath = apiRoutes.get(`${request.method} ${requestUrl.pathname}`);
    search = requestUrl.search;
  } catch {
    response.writeHead(400);
    response.end("Bad request.");
    return;
  }
  if (!upstreamPath) {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "No such API endpoint." }));
    return;
  }

  const headers = Object.fromEntries(
    Object.entries(request.headers).filter(
      ([name, value]) =>
        value !== undefined && !hopByHopHeaders.has(name) && !addressHeaders.has(name),
    ),
  );
  headers.host = apiTarget.host;
  // The client's address as this server finds it (CLIENT_IP_HEADER, TRUSTED_PROXY_HOPS, or the
  // connection), in place of whatever the client sent.
  headers["x-forwarded-for"] = clientIp(request);
  headers["x-forwarded-host"] = request.headers.host ?? "";
  headers["x-forwarded-proto"] = "https";

  const send = apiTarget.protocol === "https:" ? httpsRequest : httpRequest;
  const upstream = send(
    {
      protocol: apiTarget.protocol,
      hostname: apiTarget.hostname,
      port: apiTarget.port || undefined,
      method: request.method,
      path: `${upstreamPath}${search}`,
      headers,
    },
    (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    },
  );
  upstream.on("error", () => {
    if (response.headersSent) {
      response.destroy();
      return;
    }
    response.writeHead(502, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "The API preview is unavailable." }));
  });
  request.pipe(upstream);
}

async function proxyBetterAuth(request, response) {
  try {
    await fs.access(new URL("./dist/auth.server.mjs", import.meta.url));
  } catch (error) {
    if (error?.code === "ENOENT") {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "Better Auth is not included in this project." }));
      return;
    }
    if (response.headersSent) {
      response.destroy();
      return;
    }
    response.writeHead(500, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "Authentication request failed." }));
    return;
  }

  try {
    const authServer = await import("./dist/auth.server.mjs");
    await authServer.serveAuthRequest(request, response);
  } catch {
    if (response.headersSent) {
      response.destroy();
      return;
    }
    response.writeHead(500, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "Authentication request failed." }));
  }
}

async function serveFile(request, response) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
  } catch {
    response.writeHead(400);
    response.end("Bad request.");
    return;
  }

  const file = resolve(root, `.${pathname}`);
  if (file !== root && !file.startsWith(`${root}${sep}`)) {
    response.writeHead(403);
    response.end("Forbidden.");
    return;
  }

  let target = file;
  try {
    const stat = await fs.stat(target);
    if (stat.isDirectory()) target = join(target, "index.html");
  } catch {
    target = join(root, "index.html");
  }

  let stat;
  try {
    stat = await fs.stat(target);
    if (!stat.isFile()) throw new Error("Not a file.");
  } catch {
    response.writeHead(404);
    response.end("Not found.");
    return;
  }

  const headers = {
    "content-length": stat.size,
    "content-type": mimeTypes[extname(target)] ?? "application/octet-stream",
    "cache-control": target.includes(`${sep}assets${sep}`)
      ? "public, max-age=31536000, immutable"
      : "no-cache",
  };
  response.writeHead(200, headers);
  if (request.method === "HEAD") response.end();
  else createReadStream(target).pipe(response);
}

// Origins whose pages this server does not serve but that call /api, such as a mobile app's:
// comma-separated, in MOBILE_ORIGINS. They send the session as a bearer token, not a cookie, so
// their requests get CORS headers that allow no credentials.
// clubedge:if shell!=none
// The mobile app's pages load from capacitor://localhost on iOS and https://localhost on Android.
process.env.MOBILE_ORIGINS ??= "capacitor://localhost,https://localhost";
// clubedge:end
const mobileOrigins = new Set(
  (process.env.MOBILE_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

/** Changes the headers of the answer to a request, whichever handler writes them. */
function editHeaders(response, edit) {
  const writeHead = response.writeHead;
  response.writeHead = function (statusCode, ...rest) {
    // writeHead(statusCode[, statusMessage][, headers])
    const at = typeof rest[0] === "string" ? 1 : 0;
    rest[at] = edit({ ...rest[at] });
    return writeHead.call(this, statusCode, ...rest);
  };
}

/**
 * CORS on /api for the origins in MOBILE_ORIGINS: answers their preflights for the forwarded
 * routes and Better Auth's, and gives the answers to their requests CORS headers in place of any
 * the API sent. Returns true when it has answered the request. Other origins get no CORS headers.
 */
function allowMobileOrigins(request, response) {
  const origin = request.headers.origin;
  if (!origin || !mobileOrigins.has(origin)) {
    // clubedge:if shell!=none
    // Better Auth's bearer plugin answers each sign-in with the session token in a header, for
    // the mobile app. The website's pages keep their session in the HttpOnly cookie, out of
    // scripts' reach, so their answers go without it.
    if (request.url?.startsWith("/api/auth/")) {
      editHeaders(response, (headers) => {
        delete headers["set-auth-token"];
        delete headers["access-control-expose-headers"];
        return headers;
      });
    }
    // clubedge:end
    return false;
  }
  const cors = {
    "access-control-allow-origin": origin,
    "access-control-expose-headers": "set-auth-token",
    vary: "Origin",
  };
  const method = request.headers["access-control-request-method"];
  if (request.method === "OPTIONS" && method) {
    let pathname;
    try {
      pathname = new URL(request.url ?? "/", "http://frontend.invalid").pathname;
    } catch {
      return false;
    }
    const allowed = pathname.startsWith("/api/auth/")
      ? method === "GET" || method === "POST"
      : apiRoutes.has(`${method} ${pathname}`);
    if (!allowed) return false;
    response.writeHead(204, {
      ...cors,
      "access-control-allow-methods": "GET, POST",
      // The app's version and platform go with each request (packages/contract, app-update.ts).
      "access-control-allow-headers": "authorization, content-type, x-app-version, x-app-platform",
      "access-control-max-age": "600",
    });
    response.end();
    return true;
  }
  editHeaders(response, (headers) => {
    const kept = Object.entries(headers).filter(([name]) => !name.startsWith("access-control-"));
    // Answers differ by origin, and by whatever else the API names.
    const varies = String(headers.vary ?? "")
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name && name.toLowerCase() !== "origin");
    return { ...Object.fromEntries(kept), ...cors, vary: [...varies, "Origin"].join(", ") };
  });
  return false;
}

const server = createServer(async (request, response) => {
  const isApiRequest = request.url === "/api" || request.url?.startsWith("/api/");
  if (isApiRequest && allowMobileOrigins(request, response)) return;
  if (!isApiRequest && request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { allow: "GET, HEAD" });
    response.end("Method not allowed.");
    return;
  }
  if (isApiRequest) {
    if (request.url?.startsWith("/api/auth/")) {
      void proxyBetterAuth(request, response);
      return;
    }
    proxy(request, response);
    return;
  }
  await serveFile(request, response);
});
server.listen(Number(process.env.PORT ?? 3000), "0.0.0.0", () => {
  // The port bound, which PORT=0 leaves to the system.
  console.log(`Frontend listening on port ${server.address().port}.`);
});

import { createReadStream, promises as fs } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

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
  ["GET /api/client-errors", "/api/client-errors"], // clubedge:only observability!=none
  ["POST /api/client-errors", "/api/client-errors"], // clubedge:only observability!=none
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
      ([name, value]) => value !== undefined && !hopByHopHeaders.has(name),
    ),
  );
  headers.host = apiTarget.host;
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

createServer(async (request, response) => {
  const isApiRequest = request.url === "/api" || request.url?.startsWith("/api/");
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
}).listen(Number(process.env.PORT ?? 3000), "0.0.0.0", () => {
  console.log(`Frontend listening on port ${process.env.PORT ?? 3000}.`);
});

import { createReadStream, promises as fs } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("./dist/", import.meta.url)));
const apiUrl = process.env.API_URL;
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
  if (!apiUrl) {
    response.writeHead(503, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "API_URL is not configured." }));
    return;
  }

  let target;
  try {
    target = new URL(request.url ?? "/", apiUrl);
  } catch {
    response.writeHead(502);
    response.end("Invalid API_URL.");
    return;
  }

  const headers = Object.fromEntries(
    Object.entries(request.headers).filter(
      ([name, value]) => value !== undefined && !hopByHopHeaders.has(name),
    ),
  );
  headers.host = target.host;
  headers["x-forwarded-host"] = request.headers.host ?? "";
  headers["x-forwarded-proto"] = "https";

  const send = target.protocol === "https:" ? httpsRequest : httpRequest;
  const upstream = send(target, { method: request.method, headers }, (upstreamResponse) => {
    response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
    upstreamResponse.pipe(response);
  });
  upstream.on("error", () => {
    if (!response.headersSent) response.writeHead(502, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "The API preview is unavailable." }));
  });
  request.pipe(upstream);
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
    proxy(request, response);
    return;
  }
  await serveFile(request, response);
}).listen(Number(process.env.PORT ?? 3000), "0.0.0.0", () => {
  console.log(`Frontend listening on port ${process.env.PORT ?? 3000}.`);
});

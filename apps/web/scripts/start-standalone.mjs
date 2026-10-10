import { cp, mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standaloneRoot = path.join(webRoot, ".next", "standalone", "apps", "web");

await mkdir(path.join(standaloneRoot, ".next"), { recursive: true });
await cp(path.join(webRoot, ".next", "static"), path.join(standaloneRoot, ".next", "static"), {
  recursive: true,
  force: true,
});

const publicDirectory = path.join(webRoot, "public");
await mkdir(path.join(standaloneRoot, "public"), { recursive: true });
await cp(publicDirectory, path.join(standaloneRoot, "public"), { recursive: true, force: true });

const server = spawn(process.execPath, ["server.js"], {
  cwd: standaloneRoot,
  env: process.env,
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}

server.on("error", (error) => {
  console.error("Failed to start the standalone Next.js server:", error);
  process.exitCode = 1;
});

server.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});

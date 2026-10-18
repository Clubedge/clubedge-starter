#!/usr/bin/env node
// Proves an API in any language against the contract: starts it, waits for /api/health, runs
// the conformance suite over HTTP (src/remote.test.ts), and stops it. An API's test script:
//
//   clubedge-contract-check -- uv run python -m clubedge_api
//
// The API listens where HOST and PORT say; --port picks one that is free (default 3991).
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const windows = process.platform === "win32";
const args = process.argv.slice(2);
const separator = args.indexOf("--");
const command = separator === -1 ? [] : args.slice(separator + 1);
if (command.length === 0) {
  console.error("Usage: clubedge-contract-check [--port <port>] -- <command that starts the API>");
  process.exit(2);
}
const options = args.slice(0, separator);
const port = options.includes("--port") ? options[options.indexOf("--port") + 1] : "3991";
const url = `http://127.0.0.1:${port}`;
// scripts/ → packages/contract → packages → the workspace root, where Vitest runs.
const root = fileURLToPath(new URL("../../..", import.meta.url));

const server = spawn(command[0], command.slice(1), {
  env: { ...process.env, HOST: "127.0.0.1", PORT: port },
  stdio: "inherit",
  // Its own process group, so stopping it also stops what it started (uv, then python).
  detached: !windows,
  shell: windows,
});

function stop() {
  if (server.exitCode !== null || server.pid === undefined) return;
  if (windows) spawnSync("taskkill", ["/pid", String(server.pid), "/t", "/f"], { stdio: "ignore" });
  else {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {
      // Already gone.
    }
  }
}
process.on("exit", stop);
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => process.exit(130));
}

async function waitForHealth(timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (server.exitCode !== null)
      throw new Error(`The API exited (${server.exitCode}) before it answered.`);
    try {
      const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`The API did not answer ${url}/api/health in time.`);
}

try {
  await waitForHealth();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const suite = spawnSync("pnpm", ["exec", "vitest", "run", "packages/contract/src/remote.test.ts"], {
  cwd: root,
  env: { ...process.env, API_URL: url },
  stdio: "inherit",
  shell: windows,
});
process.exit(suite.status ?? 1);

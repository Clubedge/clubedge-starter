import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const appDirectory = fileURLToPath(new URL(".", import.meta.url));
const authServerPath = new URL("./auth.server.mjs", import.meta.url);
const children = [];

if (process.env.BETTER_AUTH_SECRET && process.env.DATABASE_URL && existsSync(authServerPath)) {
  const output = new URL("./.cache/auth.server.mjs", import.meta.url);
  mkdirSync(new URL("./.cache/", import.meta.url), { recursive: true });
  await build({
    entryPoints: [fileURLToPath(authServerPath)],
    outfile: fileURLToPath(output),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
  });
  children.push(
    spawn(process.execPath, [fileURLToPath(output)], { cwd: appDirectory, stdio: "inherit" }),
  );
}

// Arguments go on to Vite, such as --mode.
children.push(
  spawn(
    process.execPath,
    [
      fileURLToPath(new URL("./node_modules/vite/bin/vite.js", import.meta.url)),
      ...process.argv.slice(2),
    ],
    { cwd: appDirectory, stdio: "inherit" },
  ),
);

function stop(code = 0) {
  for (const child of children) child.kill("SIGTERM");
  process.exit(code);
}
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop());
for (const child of children) child.on("exit", (code) => stop(code ?? 0));

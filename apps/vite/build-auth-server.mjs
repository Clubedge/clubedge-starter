import { existsSync } from "node:fs";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const authServerPath = new URL("./auth.server.mjs", import.meta.url);
if (existsSync(authServerPath)) {
  await build({
    entryPoints: [fileURLToPath(authServerPath)],
    outfile: fileURLToPath(new URL("./dist/auth.server.mjs", import.meta.url)),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
  });
}

// Bundles the API and its dependencies into one file, so the production image needs no
// node_modules. The "@/..." imports resolve through tsconfig.json.
import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.mjs",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  // Some dependencies still call require(); give the ESM bundle one.
  banner: {
    js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
  },
  logLevel: "info",
});

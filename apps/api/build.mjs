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
  // Some dependencies still call require(); give the ESM bundle one. The import is renamed
  // because bundled modules (Sentry's) import createRequire themselves, at the same top level.
  banner: {
    js: 'import { createRequire as createBannerRequire } from "node:module"; const require = createBannerRequire(import.meta.url);',
  },
  logLevel: "info",
});

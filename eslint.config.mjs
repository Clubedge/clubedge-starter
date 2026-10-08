import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  ...tseslint.configs.recommended,
  globalIgnores([
    "**/node_modules/**",
    "**/.next/**",
    "**/.turbo/**",
    ".pnpm-store/**",
    "out/**",
    "build/**",
    "**/next-env.d.ts",
    "test-results/**",
    "playwright-report/**",
  ]),
]);

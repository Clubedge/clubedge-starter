import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

// Architecture boundaries. Shared packages stay framework-agnostic so any app (Next.js today,
// other frameworks later) can reuse them; apps reach providers only through src/server.
const frameworkImports = {
  group: ["next", "next/*", "@tanstack/*", "react", "react-dom", "react/*", "server-only"],
  message: "Shared packages must stay framework-agnostic. Accept dependencies as arguments.",
};
const appImports = {
  group: ["@/*", "**/apps/**"],
  message: "Packages must not import application code.",
};
const providerImports = {
  group: ["@supabase/*", "@aws-sdk/*", "redis", "postgres", "drizzle-orm/postgres-js"],
  message: "Use the composition root in src/server instead of a provider SDK.",
};

export default defineConfig([
  ...tseslint.configs.recommended,
  {
    files: ["packages/*/**/*.ts"],
    ignores: ["packages/ui/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [frameworkImports, appImports] }],
    },
  },
  // clubedge:if shell!=none
  {
    // The mobile app's own screens, such as its update notice, are React, like the shared UI.
    files: ["packages/mobile/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [appImports] }],
    },
  },
  // clubedge:end
  {
    files: ["packages/core/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            frameworkImports,
            appImports,
            {
              group: ["@clubedge/*"],
              message: "@clubedge/core must not depend on other packages.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/*/src/**/*.{ts,tsx}"],
    ignores: ["apps/*/src/server/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [providerImports] }],
    },
  },
  globalIgnores([
    "**/node_modules/**",
    "**/.next/**",
    "**/.output/**",
    "**/dist/**",
    "**/.nitro/**",
    "**/.tanstack/**",
    "**/routeTree.gen.ts",
    "**/.turbo/**",
    ".pnpm-store/**",
    "out/**",
    "build/**",
    "**/next-env.d.ts",
    "test-results/**",
    "playwright-report/**",
    // clubedge:if shell!=none
    // The web app's build for the mobile app, and the native projects it is copied into.
    "**/dist-app/**",
    "apps/shell/android/**",
    "apps/shell/ios/**",
    // clubedge:end
    // clubedge:if mobile!=none
    // The native app's generated Android and iOS projects, and Expo's working files.
    "apps/mobile/android/**",
    "apps/mobile/ios/**",
    "apps/expo/android/**", // clubedge:only starter-repository
    "apps/expo/ios/**", // clubedge:only starter-repository
    "**/.expo/**",
    "**/expo-env.d.ts",
    // clubedge:end
  ]),
]);

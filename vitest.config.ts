import { defineConfig } from "vitest/config";

export default defineConfig({
  // Resolves each app's "@/..." imports through its own tsconfig paths.
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["apps/*/src/**/*.test.ts", "packages/*/src/**/*.test.ts", "scripts/**/*.test.ts"],
  },
});

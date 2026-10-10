import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  // Server code reads process.env. Load .env, .env.local and friends from this directory so
  // local development behaves like the Next.js app; real environment variables still win.
  for (const [key, value] of Object.entries(loadEnv(mode, import.meta.dirname, ""))) {
    process.env[key] ??= value;
  }

  return {
    // Listen on every interface like `next dev`, so http://127.0.0.1:3000 (used by the
    // browser tests) works where localhost resolves to IPv6 only.
    server: { port: 3000, host: true },
    resolve: { tsconfigPaths: true },
    // TanStack Router and Base UI use this CommonJS package, which calls require("react").
    // Inlined into the SSR build, that call survives as a runtime require of a second React
    // copy and breaks hooks. Keeping it external lets Nitro bundle it with the one React.
    // Vite resolves externals from this app, so it is also a direct dependency here.
    environments: { ssr: { resolve: { external: ["use-sync-external-store"] } } },
    // The Start plugin must come before the React plugin.
    plugins: [tailwindcss(), tanstackStart(), nitro(), viteReact()],
  };
});

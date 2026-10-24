import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";
import site from "./src/config/site.json" with { type: "json" };

/** Fills in the page title and description in index.html from src/config/site.json. */
function siteMetadata(): Plugin {
  const escape = (value: string) =>
    value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  return {
    name: "clubedge-site-metadata",
    transformIndexHtml: (html) =>
      html
        .replaceAll("%SITE_NAME%", escape(site.name))
        .replaceAll("%SITE_DESCRIPTION%", escape(site.description)),
  };
}

export default defineConfig(({ mode }) => {
  // Load .env, .env.local and friends from this directory; real environment variables still win.
  for (const [key, value] of Object.entries(loadEnv(mode, import.meta.dirname, ""))) {
    process.env[key] ??= value;
  }

  // The browser calls the API on its own origin, so cookies stay first-party. The dev server
  // and `vite preview` forward /api to the API, as the production server does.
  const proxy = {
    "/api/auth": { target: "http://127.0.0.1:3002" },
    "/api": { target: process.env.API_URL ?? "http://127.0.0.1:3001", changeOrigin: true },
  };

  return {
    // Listen on every interface, so http://127.0.0.1:3000 (used by the browser tests) works
    // where localhost resolves to IPv6 only.
    server: { host: true, port: 3000, strictPort: true, proxy },
    preview: { host: true, port: 3000, strictPort: true, proxy },
    resolve: {
      tsconfigPaths: true,
      // clubedge:if shell!=none
      // The mobile app's demo (its build script's --demo) signs in and reads its data from fakes
      // in packages/mobile, in place of the auth provider and the API, so it needs no server.
      ...(mode === "app" &&
        process.env.VITE_DEMO === "true" && {
          alias: {
            "@/lib/auth": "@clubedge/mobile/demo/auth",
            "@/lib/api": "@clubedge/mobile/demo/api",
          },
        }),
      // clubedge:end
    },
    plugins: [tailwindcss(), viteReact(), siteMetadata()],
  };
});

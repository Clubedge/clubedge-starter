import type { NextConfig } from "next";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));

// Workspace packages ship TypeScript source and are compiled by the app. Reading them from
// package.json keeps this list right when packages are added or removed.
const { dependencies } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
);
const workspacePackages = Object.keys(dependencies).filter((name) => name.startsWith("@clubedge/"));

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  output: "standalone",
  outputFileTracingRoot: workspaceRoot,
  transpilePackages: workspacePackages,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

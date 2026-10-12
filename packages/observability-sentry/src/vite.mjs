// For TanStack Start: hidden source maps for the client build, uploaded to Sentry and deleted
// after the build, when SENTRY_AUTH_TOKEN is set. Without it the plugin changes nothing.
import { shouldUploadSourceMaps, uploadSourceMaps } from "./sourcemaps.cjs";

export function sentrySourceMaps() {
  const enabled = shouldUploadSourceMaps();
  return {
    name: "clubedge-sentry-source-maps",
    apply: "build",
    configEnvironment(name) {
      // "hidden": maps are written for the upload but the bundle does not point browsers at them.
      if (enabled && name === "client") return { build: { sourcemap: "hidden" } };
    },
    applyToEnvironment(environment) {
      return environment.name === "client";
    },
    async writeBundle(options) {
      if (enabled && options.dir) await uploadSourceMaps(options.dir);
    },
  };
}

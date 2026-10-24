import { readFileSync } from "node:fs";
import { describe } from "vitest";
import { describeApiConformance, moduleOperations } from "@clubedge/contract/conformance";
import { createApp } from "@/app";

/**
 * The modules this API has, as a generated project records them in its package.json. The
 * Starter records none and its API serves every module's routes, so it has them all.
 */
function apiModules(): Record<string, string> {
  const root = new URL("../../../package.json", import.meta.url);
  const { clubedge } = JSON.parse(readFileSync(root, "utf8"));
  return (
    clubedge?.modules ??
    Object.fromEntries(Object.keys(moduleOperations).map((module) => [module, "starter"]))
  );
}

const modules = apiModules();

// The shared contract suite, in process: the same checks any API stack passes over HTTP.
describe("the API without a database", () => {
  const app = createApp({
    serviceId: "my-product",
    isReady: async () => false,
    getCurrentUser: async () => null,
  });
  describeApiConformance("hono", () => ({ request: (path, init) => app.request(path, init) }), {
    service: "my-product",
    ready: false,
    modules,
  });
});

describe("the API with a database", () => {
  const app = createApp({
    serviceId: "my-product",
    isReady: async () => true,
    getCurrentUser: async () => null,
  });
  describeApiConformance(
    "hono (ready)",
    () => ({ request: (path, init) => app.request(path, init) }),
    {
      ready: true,
      modules,
    },
  );
});

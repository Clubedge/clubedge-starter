import { readFileSync } from "node:fs";
import { describe } from "vitest";
import {
  capabilityOperations,
  describeApiConformance,
  moduleOperations,
} from "@clubedge/contract/conformance";
import { createApp } from "@/app";
// clubedge:if jobs!=none
import { createMemoryJobs } from "@clubedge/jobs";
import { sampleJob } from "@/jobs/sample";
// clubedge:end

/**
 * The modules this API has, as a generated project records them in its package.json. The
 * Starter records none and its API serves every module's routes, so it has them all.
 */
function apiModules(): Record<string, string> {
  const root = new URL("../../../package.json", import.meta.url);
  const { clubedge } = JSON.parse(readFileSync(root, "utf8"));
  const every = [
    ...Object.keys(moduleOperations),
    ...Object.values(capabilityOperations).map(({ module }) => module),
  ];
  return clubedge?.modules ?? Object.fromEntries(every.map((module) => [module, "starter"]));
}

const modules = apiModules();
// clubedge:if jobs!=none
// A queue in memory, standing in for the jobs provider.
const queue = createMemoryJobs([sampleJob]);
// clubedge:end

// The optional parts of the contract this API implements, for the modules it has.
const capabilities = ["account"];

// Neither app below is given versions, so /api/app-version answers null for each.
const appVersion = {
  minimumVersion: null,
  latestVersion: null,
  updateUrl: null,
  nextMinimumVersion: null,
  nextMinimumFrom: null,
};

// The shared contract suite, in process: the same checks any API stack passes over HTTP.
describe("the API without a database", () => {
  const app = createApp({
    serviceId: "my-product",
    isReady: async () => false,
    getCurrentUser: async () => null,
    jobs: { runner: () => "worker", queue: () => queue }, // clubedge:only jobs!=none
  });
  describeApiConformance("hono", () => ({ request: (path, init) => app.request(path, init) }), {
    service: "my-product",
    ready: false,
    appVersion,
    modules,
    capabilities,
  });
});

describe("the API with a database", () => {
  const app = createApp({
    serviceId: "my-product",
    isReady: async () => true,
    getCurrentUser: async () => null,
    jobs: { runner: () => "worker", queue: () => queue }, // clubedge:only jobs!=none
  });
  describeApiConformance(
    "hono (ready)",
    () => ({ request: (path, init) => app.request(path, init) }),
    {
      ready: true,
      appVersion,
      modules,
      capabilities,
    },
  );
});

// With a minimum version, the suite also checks that apps below it get 426 update_required.
describe("the API with a minimum app version", () => {
  const versions = { ...appVersion, minimumVersion: "1.2.0", latestVersion: "1.4.0" };
  const app = createApp({
    serviceId: "my-product",
    isReady: async () => true,
    getCurrentUser: async () => null,
    appVersion: () => versions,
    jobs: { runner: () => "worker", queue: () => queue }, // clubedge:only jobs!=none
  });
  describeApiConformance(
    "hono (minimum app version)",
    () => ({ request: (path, init) => app.request(path, init) }),
    { ready: true, appVersion: versions, modules, capabilities },
  );
});

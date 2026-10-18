import { describe } from "vitest";
import { describeApiConformance } from "@clubedge/contract/conformance";
import { createApp } from "@/app";

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
    },
  );
});

import { describe, expect, it } from "vitest";
import { createMemoryJobs } from "@clubedge/jobs";
import { createApp } from "@/app";
import { sampleJob } from "@/jobs/sample";

function setup(handler?: (request: Request) => Promise<Response>) {
  const queue = Object.assign(createMemoryJobs([sampleJob]), handler ? { handler } : {});
  return createApp({
    serviceId: "my-product",
    isReady: async () => true,
    getCurrentUser: async () => null,
    jobs: { runner: () => "service", queue: () => queue },
  });
}

describe("/api/inngest", () => {
  it("hands Inngest's requests to its handler as they came", async () => {
    const seen: string[] = [];
    const app = setup(async (request) => {
      seen.push(`${request.method} ${new URL(request.url).search} ${await request.text()}`);
      return Response.json({ ok: true });
    });
    // Signed by Inngest, so neither JSON-only nor read before the handler checks the signature.
    const response = await app.request("/api/inngest?fnId=sample&stepId=step", {
      method: "POST",
      headers: { "content-type": "text/plain", "x-inngest-signature": "t=1&s=abc" },
      body: "raw body",
    });
    expect(response.status).toBe(200);
    expect((await app.request("/api/inngest", { method: "PUT" })).status).toBe(200);
    expect(seen).toEqual(["POST ?fnId=sample&stepId=step raw body", "PUT  "]);
  });

  it("does not exist for a queue that runs jobs itself", async () => {
    expect((await setup().request("/api/inngest")).status).toBe(404);
  });
});

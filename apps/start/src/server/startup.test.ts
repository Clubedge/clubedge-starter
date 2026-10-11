import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startJobsWorker } from "./jobs";
import { startObservability } from "./observability";

// The server starts these hooks before handling any request. A configuration mistake must be
// reported, not stop the server, so pages that need no database or provider keep working.
const holder = globalThis as typeof globalThis & {
  clubedgeJobs?: unknown;
  clubedgeObservability?: unknown;
};

beforeEach(() => {
  delete holder.clubedgeJobs;
  delete holder.clubedgeObservability;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("server startup hooks", () => {
  it("reports a missing DATABASE_URL instead of failing to start the jobs worker", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("JOBS_WORKER", "on");

    expect(() => startJobsWorker()).not.toThrow();
    expect(log).toHaveBeenCalledWith(
      "Background jobs: the worker did not start.",
      expect.any(Error),
    );
    expect(holder.clubedgeJobs).toBeUndefined();
  });

  it("leaves observability off when its settings are invalid", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "not a url");

    expect(startObservability()).toBeNull();
    expect(log).toHaveBeenCalledWith("Observability did not start.", expect.any(Error));
  });
});

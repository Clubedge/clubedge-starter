import { afterEach, describe, expect, it, vi } from "vitest";
import { startJobsWorker } from "./jobs";

// The API starts the worker as it starts serving. A configuration mistake must be reported, not
// stop the API, so endpoints that need no queue keep working.
const holder = globalThis as typeof globalThis & { clubedgeJobs?: unknown };

afterEach(() => {
  delete holder.clubedgeJobs;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("startJobsWorker", () => {
  it("reports a missing database or Redis URL instead of failing to start", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("REDIS_URL", "");
    vi.stubEnv("JOBS_WORKER", "on");

    expect(() => startJobsWorker()).not.toThrow();
    expect(log).toHaveBeenCalledWith(
      "Background jobs: the worker did not start.",
      expect.any(Error),
    );
    expect(holder.clubedgeJobs).toBeUndefined();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { startJobsWorker } from "./jobs";

// The server starts the worker before handling any request. A configuration mistake must be
// reported, not stop the server, so pages that need no database keep working.
const holder = globalThis as typeof globalThis & { clubedgeJobs?: unknown };

afterEach(() => {
  delete holder.clubedgeJobs;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("startJobsWorker", () => {
  it("reports a missing DATABASE_URL instead of failing to start", () => {
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
});

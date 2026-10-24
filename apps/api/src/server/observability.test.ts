import { afterEach, describe, expect, it, vi } from "vitest";
import { startObservability } from "./observability";

// The server starts observability before handling any request. An invalid setting must leave it
// off with a report, not stop the server.
const holder = globalThis as typeof globalThis & { clubedgeObservability?: unknown };

afterEach(() => {
  delete holder.clubedgeObservability;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("startObservability", () => {
  it("leaves observability off when its settings are invalid", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "not a url");
    vi.stubEnv("SENTRY_DSN", "not a url");

    expect(startObservability()).toBeNull();
    expect(log).toHaveBeenCalledWith("Observability did not start.", expect.any(Error));
  });
});

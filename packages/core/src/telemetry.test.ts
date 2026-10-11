import { afterEach, describe, expect, it, vi } from "vitest";
import { reportError, setTelemetry, traced, withSpans, type Telemetry } from "./telemetry";

afterEach(() => {
  setTelemetry(null);
  vi.restoreAllMocks();
});

describe("telemetry hooks", () => {
  it("logs errors to the console and runs traced work plainly by default", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("boom");

    reportError(error, { message: "Something failed" });
    expect(log).toHaveBeenCalledWith("Something failed", error);
    await expect(traced("work", async () => 42)).resolves.toBe(42);
  });

  it("sends errors and spans to an installed provider", async () => {
    const telemetry: Telemetry = {
      reportError: vi.fn(),
      traced: vi.fn((_name, run) => run()),
    };
    setTelemetry(telemetry);
    const error = new Error("boom");

    reportError(error, { message: "Webhook failed", attributes: { provider: "stripe" } });
    await expect(traced("email.send", async () => "sent", { to: "a" })).resolves.toBe("sent");

    expect(telemetry.reportError).toHaveBeenCalledWith(error, {
      message: "Webhook failed",
      attributes: { provider: "stripe" },
    });
    expect(telemetry.traced).toHaveBeenCalledWith("email.send", expect.any(Function), { to: "a" });
  });

  it("reports each error object once", () => {
    const telemetry: Telemetry = { reportError: vi.fn(), traced: (_name, run) => run() };
    setTelemetry(telemetry);
    const error = new Error("boom");

    reportError(error, { message: "Route failed" });
    reportError(error, { message: "Request failed" });
    reportError("a string");
    reportError("a string");

    expect(telemetry.reportError).toHaveBeenCalledTimes(3);
  });

  it("falls back to the console when the provider throws", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    setTelemetry({
      reportError: () => {
        throw new Error("provider down");
      },
      traced: (_name, run) => run(),
    });

    expect(() => reportError(new Error("boom"))).not.toThrow();
    expect(log).toHaveBeenCalledWith("Unexpected error", expect.any(Error));
    expect(log).toHaveBeenCalledWith("Error reporting failed", expect.any(Error));
  });
});

describe("withSpans", () => {
  it("runs each method in a span named after it and keeps results and errors", async () => {
    const names: string[] = [];
    setTelemetry({
      reportError: vi.fn(),
      traced: (name, run) => {
        names.push(name);
        return run();
      },
    });
    const storage = withSpans("storage", {
      exists: async (key: string) => key === "a",
      delete: async (key: string) => {
        throw new Error(`denied: ${key}`);
      },
    });

    await expect(storage.exists("a")).resolves.toBe(true);
    await expect(storage.delete("a")).rejects.toThrow("denied: a");
    expect(names).toEqual(["storage.exists", "storage.delete"]);
  });
});

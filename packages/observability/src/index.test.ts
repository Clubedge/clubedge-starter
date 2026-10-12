import { describe, expect, it } from "vitest";
import { ClientError, createMemoryObservability, parseClientErrorReport } from "./index";

describe("parseClientErrorReport", () => {
  it("keeps the expected fields and drops the query string", () => {
    expect(
      parseClientErrorReport({
        kind: "error",
        name: "TypeError",
        message: "x is undefined",
        stack: "at render (app.js:1:2)",
        path: "/dashboard?token=secret#top",
        cookie: "ignored",
      }),
    ).toEqual({
      kind: "error",
      name: "TypeError",
      message: "x is undefined",
      stack: "at render (app.js:1:2)",
      path: "/dashboard",
    });
  });

  it("caps long fields and rejects anything else", () => {
    const report = parseClientErrorReport({
      kind: "unhandledrejection",
      message: "m".repeat(5_000),
      path: "/",
    });
    expect(report?.message).toHaveLength(1_000);
    expect(report?.name).toBe("Error");
    expect(parseClientErrorReport(null)).toBeNull();
    expect(parseClientErrorReport({ kind: "error", message: "", path: "/" })).toBeNull();
    expect(parseClientErrorReport({ kind: "other", message: "m", path: "/" })).toBeNull();
    expect(
      parseClientErrorReport({ kind: "error", message: "m", path: "https://evil.example/" }),
    ).toBeNull();
  });

  it("turns a report into an error with the browser's stack", () => {
    const error = new ClientError({
      kind: "error",
      name: "TypeError",
      message: "boom",
      stack: "at a (b.js:1:1)",
      path: "/",
    });
    expect(error.message).toBe("TypeError: boom");
    expect(error.stack).toBe("TypeError: boom\nat a (b.js:1:1)");
  });
});

describe("createMemoryObservability", () => {
  it("records errors and nested spans", async () => {
    const memory = createMemoryObservability();
    await memory.traced("outer", () => memory.traced("inner", async () => 1));
    memory.reportError(new Error("x"), { message: "m" });
    expect(memory.spans.map((span) => [span.name, span.parent])).toEqual([
      ["inner", "outer"],
      ["outer", null],
    ]);
    expect(memory.errors).toHaveLength(1);
  });
});

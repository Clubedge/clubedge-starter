import { describe, expect, it, vi } from "vitest";
import { AppError, errorResponse } from "./index";

describe("errorResponse", () => {
  it("returns a safe structured response for application errors", async () => {
    const response = errorResponse(new AppError("Not found", "NOT_FOUND", 404));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { code: "NOT_FOUND", message: "Not found" } });
  });

  it("hides unexpected error details from clients", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = errorResponse(new Error("database password leaked"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." },
    });
    vi.restoreAllMocks();
  });
});

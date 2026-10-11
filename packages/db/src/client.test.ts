import { describe, expect, it } from "vitest";
import { isDatabaseReady, type Database } from "./client";

const databaseThat = (execute: () => Promise<unknown>) => ({ execute }) as unknown as Database;

describe("isDatabaseReady", () => {
  it("is ready when the database answers", async () => {
    expect(await isDatabaseReady(databaseThat(async () => [{ "?column?": 1 }]))).toBe(true);
  });

  it("is not ready when the query fails", async () => {
    const failing = databaseThat(async () => {
      throw new Error("connection refused");
    });
    expect(await isDatabaseReady(failing)).toBe(false);
  });

  it("is not ready when the database does not answer in time", async () => {
    const started = Date.now();
    expect(
      await isDatabaseReady(
        databaseThat(() => new Promise(() => {})),
        50,
      ),
    ).toBe(false);
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});

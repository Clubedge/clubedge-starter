import { describe, expect, it } from "vitest";
import { createMemoryCache } from "./memory-cache";

describe("createMemoryCache", () => {
  it("returns stored values until they expire", async () => {
    let time = 1_000;
    const cache = createMemoryCache({ now: () => time });

    await cache.set("greeting", { text: "hello" }, 60);
    expect(await cache.get("greeting")).toEqual({ text: "hello" });

    time += 60_000;
    expect(await cache.get("greeting")).toBeNull();
  });

  it("misses unknown keys", async () => {
    expect(await createMemoryCache().get("missing")).toBeNull();
  });

  it("stores a copy, not a live reference", async () => {
    const cache = createMemoryCache();
    const value = { count: 1 };
    await cache.set("value", value, 60);
    value.count = 2;
    expect(await cache.get("value")).toEqual({ count: 1 });
  });

  it("evicts the oldest entry past maxKeys", async () => {
    const cache = createMemoryCache({ maxKeys: 2 });
    await cache.set("a", 1, 60);
    await cache.set("b", 2, 60);
    await cache.set("c", 3, 60);
    expect(await cache.get("a")).toBeNull();
    expect(await cache.get("c")).toBe(3);
  });

  it("rejects a TTL that is not positive", async () => {
    await expect(createMemoryCache().set("a", 1, 0)).rejects.toThrow("positive");
  });
});

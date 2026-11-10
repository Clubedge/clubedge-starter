import { describe, expect, it } from "vitest";
import { parseByteRange } from "./range";

describe("parseByteRange", () => {
  it("reads one range, as browsers ask for a video's bytes", () => {
    expect(parseByteRange("bytes=0-1", 1_000)).toEqual({ start: 0, end: 1 });
    expect(parseByteRange("bytes=0-", 1_000)).toEqual({ start: 0, end: 999 });
    expect(parseByteRange("bytes=500-999", 1_000)).toEqual({ start: 500, end: 999 });
    expect(parseByteRange(" bytes=10-20 ", 1_000)).toEqual({ start: 10, end: 20 });
    expect(parseByteRange("BYTES=10-20", 1_000)).toEqual({ start: 10, end: 20 });
  });

  it("stops a range at the object's end", () => {
    expect(parseByteRange("bytes=900-5000", 1_000)).toEqual({ start: 900, end: 999 });
  });

  it("reads the last bytes", () => {
    expect(parseByteRange("bytes=-100", 1_000)).toEqual({ start: 900, end: 999 });
    expect(parseByteRange("bytes=-5000", 1_000)).toEqual({ start: 0, end: 999 });
  });

  it("can't satisfy a range past the end, or none of the last bytes", () => {
    expect(parseByteRange("bytes=1000-", 1_000)).toBe("unsatisfiable");
    expect(parseByteRange("bytes=2000-3000", 1_000)).toBe("unsatisfiable");
    expect(parseByteRange("bytes=-0", 1_000)).toBe("unsatisfiable");
  });

  it("sends the whole object for what it doesn't read", () => {
    expect(parseByteRange(null, 1_000)).toBeNull();
    expect(parseByteRange("", 1_000)).toBeNull();
    expect(parseByteRange("bytes=-", 1_000)).toBeNull();
    expect(parseByteRange("bytes=0-1,5-6", 1_000)).toBeNull();
    expect(parseByteRange("items=0-1", 1_000)).toBeNull();
    expect(parseByteRange("bytes=20-10", 1_000)).toBeNull();
    expect(parseByteRange("bytes=a-b", 1_000)).toBeNull();
    // Its size unknown.
    expect(parseByteRange("bytes=0-1", 0)).toBeNull();
  });

  it("reads numbers of any length", () => {
    const huge = "9".repeat(5_000);
    expect(parseByteRange(`bytes=${huge}-`, 1_000)).toBe("unsatisfiable");
    expect(parseByteRange(`bytes=0-${huge}`, 1_000)).toEqual({ start: 0, end: 999 });
    expect(parseByteRange(`bytes=-${huge}`, 1_000)).toEqual({ start: 0, end: 999 });
    expect(parseByteRange(`bytes=${"0".repeat(5_000)}5-`, 1_000)).toEqual({ start: 5, end: 999 });
  });
});

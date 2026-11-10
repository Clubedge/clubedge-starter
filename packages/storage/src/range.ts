import type { ByteRange } from "./types";

/**
 * The bytes an HTTP Range header asks for of an object of `size` bytes, as browsers ask for a
 * video's: one range ("bytes=0-", "bytes=500-999", or the last bytes, "bytes=-500"). Null to send
 * the whole object: no header, one this doesn't read (several ranges, other units), or one that
 * isn't valid, which HTTP says to ignore. "unsatisfiable" when it starts past the end.
 */
export function parseByteRange(
  header: string | null | undefined,
  size: number,
): Required<ByteRange> | "unsatisfiable" | null {
  if (!header || !Number.isSafeInteger(size) || size <= 0) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!match) return null;
  const [, first = "", last = ""] = match;
  if (first === "" && last === "") return null;
  if (first === "") {
    // The last bytes.
    const suffix = Number(last);
    if (suffix === 0) return "unsatisfiable";
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(first);
  if (last !== "" && Number(last) < start) return null;
  if (start >= size) return "unsatisfiable";
  return { start, end: last === "" ? size - 1 : Math.min(Number(last), size - 1) };
}

import { describe, expect, it } from "vitest";
import { readTextBody } from "./request-body";

function streamOf(...parts: string[]) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part));
      controller.close();
    },
  });
}

function post(body: BodyInit | null, headers?: HeadersInit) {
  return new Request("http://local/", {
    method: "POST",
    body,
    headers,
    duplex: "half",
  } as RequestInit);
}

describe("readTextBody", () => {
  it("returns a body within the limit", async () => {
    expect(await readTextBody(post(streamOf("héllo", " world")), 100)).toBe("héllo world");
    expect(await readTextBody(post(null), 100)).toBe("");
  });

  it("rejects a declared length over the limit without reading", async () => {
    expect(await readTextBody(post("x", { "content-length": "101" }), 100)).toBeNull();
  });

  it("stops reading once the actual bytes pass the limit", async () => {
    expect(await readTextBody(post(streamOf("a".repeat(60), "b".repeat(60))), 100)).toBeNull();
  });
});

import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseStorage } from "./index";

// Supabase's own client with a stand-in for the network, so the tests see the requests that
// would reach Supabase Storage.
const fetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

const supabase = createClient("https://project.supabase.co", "sb_publishable_key", {
  auth: { persistSession: false },
  global: { fetch },
});

/** The method, address, and Range header of each request sent. */
function requests() {
  return fetch.mock.calls.map(([input, init]) => ({
    method: init?.method,
    url: String(input),
    range: new Headers(init?.headers).get("range"),
  }));
}

describe("createSupabaseStorage", () => {
  beforeEach(() => {
    fetch.mockReset();
  });

  it("downloads the whole object without a Range header", async () => {
    const storage = createSupabaseStorage({ bucket: "files", getClient: () => supabase });
    fetch.mockResolvedValueOnce(new Response("0123456789"));

    const body = await storage.download("media/clip.mp4");

    expect(await new Response(body).text()).toBe("0123456789");
    expect(requests()).toEqual([
      {
        method: "GET",
        url: "https://project.supabase.co/storage/v1/object/files/media/clip.mp4",
        range: null,
      },
    ]);
  });

  it("asks for the bytes a range names, for that download only", async () => {
    const storage = createSupabaseStorage({ bucket: "files", getClient: () => supabase });
    fetch.mockImplementation(async () => new Response("456", { status: 206 }));

    const part = await storage.download("media/clip.mp4", { range: { start: 4, end: 6 } });
    expect(await new Response(part).text()).toBe("456");
    await storage.download("media/clip.mp4", { range: { start: 7 } });
    await storage.download("media/clip.mp4");

    expect(requests().map(({ range }) => range)).toEqual(["bytes=4-6", "bytes=7-", null]);
  });

  it("fails with what Supabase answered when it refuses a download", async () => {
    const storage = createSupabaseStorage({ bucket: "files", getClient: () => supabase });
    fetch.mockResolvedValueOnce(
      Response.json({ statusCode: "404", message: "Object not found" }, { status: 400 }),
    );

    await expect(
      storage.download("media/missing.mp4", { range: { start: 0, end: 1 } }),
    ).rejects.toThrow("Object not found");
  });

  it("fails clearly when the bucket is not configured", async () => {
    const storage = createSupabaseStorage({ getClient: () => supabase });

    await expect(storage.download("a.txt")).rejects.toThrow(
      "SUPABASE_STORAGE_BUCKET must be configured",
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});

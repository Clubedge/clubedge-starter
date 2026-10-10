import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();

vi.mock("@aws-sdk/client-s3", () => {
  class Command {
    constructor(public readonly input: Record<string, unknown>) {}
  }
  return {
    S3Client: vi.fn(function () {
      return { send };
    }),
    PutObjectCommand: class extends Command {},
    GetObjectCommand: class extends Command {},
    DeleteObjectCommand: class extends Command {},
    HeadObjectCommand: class extends Command {},
  };
});
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(async () => "https://signed.example/object"),
}));

const { S3Client } = await import("@aws-sdk/client-s3");
const { createS3Storage } = await import("./s3");

describe("createS3Storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not create a client until the first operation", async () => {
    const storage = createS3Storage({ bucket: "files", region: "auto" });
    expect(S3Client).not.toHaveBeenCalled();
    send.mockResolvedValueOnce({});
    await storage.delete("a.txt");
    await storage.delete("b.txt");
    expect(S3Client).toHaveBeenCalledTimes(1);
  });

  it("uploads to the configured bucket and builds the public URL", async () => {
    const storage = createS3Storage({
      bucket: "files",
      region: "auto",
      publicUrl: "https://cdn.example/",
    });
    send.mockResolvedValueOnce({});

    const result = await storage.upload({
      key: "avatars/1.png",
      body: new Uint8Array([1, 2, 3]),
      contentType: "image/png",
      contentLength: 3,
    });

    expect(send.mock.calls[0][0].input).toMatchObject({
      Bucket: "files",
      Key: "avatars/1.png",
      ContentType: "image/png",
      ContentLength: 3,
    });
    expect(result).toEqual({ key: "avatars/1.png", url: "https://cdn.example/avatars/1.png" });
  });

  it("fails clearly when the bucket is not configured", async () => {
    const storage = createS3Storage({ region: "auto" });
    await expect(storage.exists("a.txt")).rejects.toThrow("STORAGE_BUCKET must be configured");
    expect(send).not.toHaveBeenCalled();
  });

  it("treats a missing object as not existing and rethrows other errors", async () => {
    const storage = createS3Storage({ bucket: "files", region: "auto" });
    send.mockRejectedValueOnce(Object.assign(new Error("missing"), { name: "NotFound" }));
    expect(await storage.exists("a.txt")).toBe(false);

    send.mockRejectedValueOnce(Object.assign(new Error("denied"), { name: "AccessDenied" }));
    await expect(storage.exists("a.txt")).rejects.toThrow("denied");
  });

  it("signs download URLs with a default five-minute expiry", async () => {
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const storage = createS3Storage({ bucket: "files", region: "auto" });

    expect(await storage.getSignedUrl("a.txt")).toBe("https://signed.example/object");
    expect(vi.mocked(getSignedUrl).mock.calls[0][2]).toEqual({ expiresIn: 300 });
  });
});

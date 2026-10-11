import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFileSystemStorage } from "./file-system";

describe("createFileSystemStorage", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "clubedge-storage-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("uploads, reads back, and deletes objects in nested folders", async () => {
    const storage = createFileSystemStorage({ directory });
    await storage.upload({
      key: "avatars/user-1.txt",
      body: new TextEncoder().encode("hello"),
      contentType: "text/plain",
    });

    expect(await readFile(join(directory, "avatars", "user-1.txt"), "utf8")).toBe("hello");
    expect(await storage.exists("avatars/user-1.txt")).toBe(true);
    expect(await new Response(await storage.download("avatars/user-1.txt")).text()).toBe("hello");

    await storage.delete("avatars/user-1.txt");
    expect(await storage.exists("avatars/user-1.txt")).toBe(false);
  });

  it("accepts blobs and streams as bodies", async () => {
    const storage = createFileSystemStorage({ directory });
    await storage.upload({
      key: "blob.txt",
      body: new Blob(["from a blob"]),
      contentType: "text/plain",
    });
    await storage.upload({
      key: "stream.txt",
      body: new Blob(["from a stream"]).stream(),
      contentType: "text/plain",
    });

    expect(await readFile(join(directory, "blob.txt"), "utf8")).toBe("from a blob");
    expect(await readFile(join(directory, "stream.txt"), "utf8")).toBe("from a stream");
  });

  it("rejects keys that would leave the folder", async () => {
    const storage = createFileSystemStorage({ directory });
    const body = new Uint8Array();
    for (const key of ["../outside.txt", "a/../../outside.txt", "", join(directory, "..", "x")]) {
      await expect(storage.upload({ key, body, contentType: "text/plain" })).rejects.toThrow(
        "Invalid storage key",
      );
    }
  });

  it("leaves no file behind when a streamed upload fails", async () => {
    const storage = createFileSystemStorage({ directory });
    const failing = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("partial"));
        controller.error(new Error("connection lost"));
      },
    });

    await expect(
      storage.upload({ key: "uploads/broken.txt", body: failing, contentType: "text/plain" }),
    ).rejects.toThrow("connection lost");
    expect(await readdir(join(directory, "uploads"))).toEqual([]);
  });

  it("rejects keys that leave the folder through a symbolic link", async () => {
    const outside = await mkdtemp(join(tmpdir(), "clubedge-outside-"));
    try {
      await writeFile(join(outside, "secret.txt"), "secret");
      await mkdir(directory, { recursive: true });
      // A junction on Windows needs no extra privileges; other systems ignore the type.
      await symlink(outside, join(directory, "linked"), "junction");
      const storage = createFileSystemStorage({ directory });
      const body = new TextEncoder().encode("x");

      await expect(
        storage.upload({ key: "linked/new.txt", body, contentType: "text/plain" }),
      ).rejects.toThrow("Invalid storage key");
      await expect(storage.download("linked/secret.txt")).rejects.toThrow("Invalid storage key");
      await expect(storage.delete("linked/secret.txt")).rejects.toThrow("Invalid storage key");
      expect(await readFile(join(outside, "secret.txt"), "utf8")).toBe("secret");
      expect(await readdir(outside)).toEqual(["secret.txt"]);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("treats objects as missing before the folder exists", async () => {
    const storage = createFileSystemStorage({ directory: join(directory, "not-created") });
    expect(await storage.exists("a.txt")).toBe(false);
    await expect(storage.delete("a.txt")).resolves.toBeUndefined();
    await expect(storage.download("a.txt")).rejects.toThrow("Object not found");
  });

  it("fails to download a missing object and deletes missing objects quietly", async () => {
    const storage = createFileSystemStorage({ directory });
    await expect(storage.download("missing.txt")).rejects.toThrow();
    await expect(storage.delete("missing.txt")).resolves.toBeUndefined();
  });
});

import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { access, lstat, mkdir, realpath, rename, rm } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import type { StorageProvider, UploadInput } from "./types";

export interface FileSystemStorageConfig {
  /** Folder that holds the objects; created on first upload. */
  directory: string;
}

function bodyStream(body: UploadInput["body"]): Readable {
  if (body instanceof Uint8Array) return Readable.from([body]);
  if (body instanceof ArrayBuffer) return Readable.from([new Uint8Array(body)]);
  const stream = body instanceof Blob ? body.stream() : body;
  return Readable.fromWeb(stream as NodeReadableStream<Uint8Array>);
}

function isInside(root: string, path: string) {
  const inside = relative(root, path);
  return inside !== "" && !inside.startsWith("..") && !isAbsolute(inside);
}

function isMissing(error: unknown) {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

/**
 * Stores objects as files in a local folder, for development without an object storage service.
 * Keys map to paths inside the folder. Keys that would leave it are rejected, including through
 * symbolic links inside the folder.
 */
export function createFileSystemStorage({ directory }: FileSystemStorageConfig): StorageProvider {
  const root = resolve(directory);

  function lexicalPath(key: string) {
    const path = resolve(root, key);
    if (!key || !isInside(root, path)) throw new Error(`Invalid storage key: ${key}`);
    return path;
  }

  /** Throws unless the deepest existing folder on the way to `path` is inside the root. */
  async function assertNoLinkEscape(path: string) {
    const realRoot = await realpath(root);
    let folder = dirname(path);
    while (true) {
      try {
        const realFolder = await realpath(folder);
        if (realFolder !== realRoot && !isInside(realRoot, realFolder)) {
          throw new Error(`Invalid storage key: ${relative(root, path)}`);
        }
        break;
      } catch (error) {
        if (!isMissing(error)) throw error;
        folder = dirname(folder);
      }
    }
    try {
      if ((await lstat(path)).isSymbolicLink()) {
        throw new Error(`Invalid storage key: ${relative(root, path)}`);
      }
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }

  /** The file for `key`, checked against the root. Resolves null when the root does not exist. */
  async function existingPath(key: string) {
    const path = lexicalPath(key);
    try {
      await assertNoLinkEscape(path);
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
    return path;
  }

  return {
    async upload({ key, body }) {
      const path = lexicalPath(key);
      await mkdir(root, { recursive: true });
      await assertNoLinkEscape(path);
      await mkdir(dirname(path), { recursive: true });
      await assertNoLinkEscape(path);
      // Stream into a temporary file, then rename it, so a failed upload leaves nothing behind.
      const partial = `${path}.${randomUUID()}.partial`;
      try {
        await pipeline(bodyStream(body), createWriteStream(partial, { flags: "wx" }));
        await rename(partial, path);
      } catch (error) {
        await rm(partial, { force: true });
        throw error;
      }
      return { key };
    },
    async download(key) {
      const path = await existingPath(key);
      if (!path) throw new Error(`Object not found: ${key}`);
      await access(path);
      return Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>;
    },
    async delete(key) {
      const path = await existingPath(key);
      if (path) await rm(path, { force: true });
    },
    async exists(key) {
      const path = await existingPath(key);
      if (!path) return false;
      try {
        // A key whose parent folders exist is still a missing object, as in object storage.
        return (await lstat(path)).isFile();
      } catch {
        return false;
      }
    },
    async getSignedUrl() {
      throw new Error("Local folder storage cannot create URLs; serve the files through your app.");
    },
  };
}

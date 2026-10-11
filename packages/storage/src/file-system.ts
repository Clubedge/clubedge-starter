import { createReadStream } from "node:fs";
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { Readable } from "node:stream";
import type { StorageProvider, UploadInput } from "./types";

export interface FileSystemStorageConfig {
  /** Folder that holds the objects; created on first upload. */
  directory: string;
}

async function bodyBytes(body: UploadInput["body"]): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  return new Uint8Array(await new Response(body).arrayBuffer());
}

/**
 * Stores objects as files in a local folder, for development without an object storage service.
 * Keys map to paths inside the folder; keys that would leave it are rejected.
 */
export function createFileSystemStorage({ directory }: FileSystemStorageConfig): StorageProvider {
  const root = resolve(directory);

  function pathFor(key: string) {
    const path = resolve(root, key);
    const inside = relative(root, path);
    if (!key || !inside || inside.startsWith("..") || isAbsolute(inside)) {
      throw new Error(`Invalid storage key: ${key}`);
    }
    return path;
  }

  return {
    async upload({ key, body }) {
      const path = pathFor(key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, await bodyBytes(body));
      return { key };
    },
    async download(key) {
      const path = pathFor(key);
      await access(path);
      return Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>;
    },
    async delete(key) {
      await rm(pathFor(key), { force: true });
    },
    async exists(key) {
      try {
        await access(pathFor(key));
        return true;
      } catch {
        return false;
      }
    },
    async getSignedUrl() {
      throw new Error("Local folder storage cannot create URLs; serve the files through your app.");
    },
  };
}

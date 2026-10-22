// The behaviour every StorageProvider must have, as one test suite. A provider's tests call
// describeStorage with a harness, so a new provider is proven by passing it rather than by
// review, and providers can't drift apart on roundtrips, existence, deletion, or signed URLs:
//
//   describeStorage("s3", () => ({ storage: () => createS3Storage(config) }));
//
// It runs in Vitest, which is why it is a separate entry (`@clubedge/storage/conformance`) that
// only tests import. Each test uses its own keys, so a provider may keep objects between tests.
import { afterEach, describe, expect, it } from "vitest";
import type { StorageProvider } from "./types";

export interface StorageHarness {
  /** A provider ready for operations, bound to a space of its own. */
  storage(): StorageProvider | Promise<StorageProvider>;
  /** false when the provider cannot sign URLs (local folder storage). Default true. */
  signedUrls?: boolean;
  /** Called after each test, to release what the harness holds (a temporary folder, say). */
  dispose?(): Promise<void> | void;
}

export interface StorageConformanceOptions {
  /** Skip the whole suite, for example when the provider's server isn't running. */
  skip?: boolean | string;
  /** Per-test timeout in milliseconds, for providers behind a network round trip. Default 30s. */
  timeoutMs?: number;
}

/** Unique keys, so providers that keep objects between runs never mix them up. */
let counter = 0;
const uniqueKey = (name: string) => `conformance/${Date.now().toString(36)}-${counter++}/${name}`;

async function bytes(stream: ReadableStream<Uint8Array>) {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const out = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export function describeStorage(
  provider: string,
  setup: () => StorageHarness | Promise<StorageHarness>,
  options: StorageConformanceOptions = {},
) {
  const timeout = options.timeoutMs ?? 30_000;
  const suite = options.skip ? describe.skip : describe;
  const uploads: Array<{ storage: StorageProvider; key: string }> = [];
  const opened: StorageHarness[] = [];

  /** A harness for one test, remembered so afterEach can clean up after it. */
  const open = async (): Promise<StorageHarness> => {
    const harness = await setup();
    opened.push(harness);
    return harness;
  };

  const track = (storage: StorageProvider, key: string) => uploads.push({ storage, key });

  afterEach(async () => {
    await Promise.allSettled(uploads.splice(0).map(({ storage, key }) => storage.delete(key)));
    await Promise.allSettled(opened.splice(0).map((harness) => harness.dispose?.()));
  });

  suite(`StorageProvider conformance: ${provider}`, () => {
    it(
      "uploads bytes, then downloads them back unchanged",
      async () => {
        const storage = await (await open()).storage();
        const key = uniqueKey("hello.txt");
        const body = new Uint8Array([104, 105, 32, 116, 104, 101, 114, 101]);

        const uploaded = await storage.upload({
          key,
          body,
          contentType: "text/plain",
          contentLength: body.length,
        });
        track(storage, key);
        expect(uploaded.key).toBe(key);
        expect(await bytes(await storage.download(key))).toEqual(body);
      },
      timeout,
    );

    it(
      "accepts Blob and ArrayBuffer bodies",
      async () => {
        const storage = await (await open()).storage();

        const blobBytes = new Uint8Array([1, 2, 3, 4]);
        const blobKey = uniqueKey("blob.bin");
        await storage.upload({
          key: blobKey,
          body: new Blob([blobBytes], { type: "application/octet-stream" }),
          contentType: "application/octet-stream",
        });
        track(storage, blobKey);
        expect(await bytes(await storage.download(blobKey))).toEqual(blobBytes);

        const buffer = new ArrayBuffer(4);
        new Uint8Array(buffer).set([5, 6, 7, 8]);
        const bufferKey = uniqueKey("buffer.bin");
        await storage.upload({
          key: bufferKey,
          body: buffer,
          contentType: "application/octet-stream",
        });
        track(storage, bufferKey);
        expect(await bytes(await storage.download(bufferKey))).toEqual(
          new Uint8Array([5, 6, 7, 8]),
        );
      },
      timeout,
    );

    it(
      "reports whether keys exist",
      async () => {
        const storage = await (await open()).storage();
        const key = uniqueKey("exists.txt");
        expect(await storage.exists(key)).toBe(false);

        await storage.upload({
          key,
          body: new Uint8Array([1]),
          contentType: "application/octet-stream",
        });
        track(storage, key);
        expect(await storage.exists(key)).toBe(true);
      },
      timeout,
    );

    it(
      "keeps nested keys separate",
      async () => {
        const storage = await (await open()).storage();
        const folder = uniqueKey("nested");
        const deep = `${folder}/deep/file.txt`;

        await storage.upload({
          key: deep,
          body: new Uint8Array([110]),
          contentType: "text/plain",
        });
        track(storage, deep);
        expect(await storage.exists(deep)).toBe(true);
        expect(await storage.exists(`${folder}/deep`)).toBe(false);
        expect(await bytes(await storage.download(deep))).toEqual(new Uint8Array([110]));
      },
      timeout,
    );

    it(
      "refuses to download a key that does not exist",
      async () => {
        const storage = await (await open()).storage();
        await expect(storage.download(uniqueKey("missing.txt"))).rejects.toThrow();
      },
      timeout,
    );

    it(
      "deletes an object, and deleting a missing object changes nothing",
      async () => {
        const storage = await (await open()).storage();
        const key = uniqueKey("gone.txt");
        await storage.upload({
          key,
          body: new Uint8Array([1]),
          contentType: "application/octet-stream",
        });
        track(storage, key);

        await storage.delete(key);
        expect(await storage.exists(key)).toBe(false);
        await expect(storage.delete(key)).resolves.toBeUndefined();
      },
      timeout,
    );

    it(
      "creates a signed URL for downloading",
      async () => {
        const harness = await open();
        if (harness.signedUrls === false) return;
        const storage = await harness.storage();
        const key = uniqueKey("signed.txt");
        await storage.upload({
          key,
          body: new Uint8Array([1]),
          contentType: "application/octet-stream",
        });
        track(storage, key);

        const url = new URL(await storage.getSignedUrl(key));
        expect(url.href).toContain(key);
        await expect(storage.getSignedUrl(key, { expiresInSeconds: 60 })).resolves.toBeTruthy();
      },
      timeout,
    );
  });
}

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StorageProvider, UploadInput } from "@clubedge/storage";

export interface S3StorageConfig {
  /** Optional so the app can start without storage; operations fail until it is set. */
  bucket?: string;
  region: string;
  endpoint?: string;
  /**
   * Address buckets as https://endpoint/bucket rather than https://bucket.endpoint. Defaults to
   * true with a custom endpoint, which local servers (s3mock), MinIO, and R2 all accept.
   */
  forcePathStyle?: boolean;
  accessKeyId?: string;
  secretAccessKey?: string;
  /** Public base URL for uploaded objects, such as a CDN or R2 public bucket. */
  publicUrl?: string;
}

/** The SDK hashes bodies in memory with its default checksums and cannot hash a flowing
 *  stream (Blob.stream() or a ReadableStream), so every body is read into bytes first. */
async function bodyForS3(body: UploadInput["body"]): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (body instanceof Blob) return new Uint8Array(await body.arrayBuffer());
  const chunks: Uint8Array[] = [];
  const reader = body.getReader();
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

/** Works with AWS S3 and S3-compatible services such as Cloudflare R2, MinIO, and s3mock. */
export function createS3Storage(config: S3StorageConfig): StorageProvider {
  let s3Client: S3Client | undefined;

  function client() {
    s3Client ??= new S3Client({
      region: config.region,
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
      forcePathStyle: config.forcePathStyle ?? Boolean(config.endpoint),
      credentials:
        config.accessKeyId && config.secretAccessKey
          ? { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }
          : undefined,
    });
    return s3Client;
  }

  function bucket() {
    if (!config.bucket) throw new Error("STORAGE_BUCKET must be configured for S3 storage.");
    return config.bucket;
  }

  return {
    async upload({ key, body, contentType, contentLength }) {
      await client().send(
        new PutObjectCommand({
          Bucket: bucket(),
          Key: key,
          Body: await bodyForS3(body),
          ContentType: contentType,
          ...(contentLength ? { ContentLength: contentLength } : {}),
        }),
      );
      const url = config.publicUrl ? `${config.publicUrl.replace(/\/$/, "")}/${key}` : undefined;
      return { key, url };
    },
    async download(key) {
      const result = await client().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
      if (!result.Body) throw new Error(`Storage object not found: ${key}`);
      return result.Body.transformToWebStream() as ReadableStream<Uint8Array>;
    },
    async delete(key) {
      await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
    },
    async exists(key) {
      try {
        await client().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
        return true;
      } catch (error) {
        if (error && typeof error === "object" && "name" in error && error.name === "NotFound")
          return false;
        throw error;
      }
    },
    async getSignedUrl(key, options) {
      const command = new GetObjectCommand({ Bucket: bucket(), Key: key });
      return getSignedUrl(client(), command, { expiresIn: options?.expiresInSeconds ?? 300 });
    },
  };
}

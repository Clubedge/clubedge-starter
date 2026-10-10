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
  accessKeyId?: string;
  secretAccessKey?: string;
  /** Public base URL for uploaded objects, such as a CDN or R2 public bucket. */
  publicUrl?: string;
}

function bodyForS3(body: UploadInput["body"]) {
  if (body instanceof Blob) return body.stream();
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  return body;
}

/** Works with AWS S3 and S3-compatible services such as Cloudflare R2 and MinIO. */
export function createS3Storage(config: S3StorageConfig): StorageProvider {
  let s3Client: S3Client | undefined;

  function client() {
    s3Client ??= new S3Client({
      region: config.region,
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
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
          Body: bodyForS3(body),
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

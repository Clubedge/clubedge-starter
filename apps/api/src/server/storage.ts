import { z } from "zod";
import type { StorageProvider } from "@clubedge/storage";
import { createS3Storage } from "@clubedge/storage-s3";
// clubedge:if infra=local
import { createFileSystemStorage } from "@clubedge/storage/file-system";
// clubedge:end
import { withSpans } from "@clubedge/core";
import { optional, parseEnv } from "@/env";

export type { SignedUrlOptions, StorageProvider, UploadInput } from "@clubedge/storage";

// S3-compatible storage: AWS S3, Cloudflare R2, MinIO, and similar services.
const storageEnvSchema = z.object({
  STORAGE_BUCKET: optional(z.string()),
  STORAGE_REGION: z.string().default("auto"),
  STORAGE_ENDPOINT: optional(z.url()),
  STORAGE_ACCESS_KEY_ID: optional(z.string()),
  STORAGE_SECRET_ACCESS_KEY: optional(z.string()),
  STORAGE_PUBLIC_URL: optional(z.url()),
  // clubedge:if infra=local
  STORAGE_DIRECTORY: optional(z.string()),
  // clubedge:end
});

let provider: StorageProvider | undefined;

function resolveProvider(): StorageProvider {
  if (provider) return provider;
  const env = parseEnv(storageEnvSchema, "Storage");
  // clubedge:if infra=local
  // In development without an object storage service, a local folder stands in for S3.
  if (env.STORAGE_DIRECTORY) {
    provider = createFileSystemStorage({ directory: env.STORAGE_DIRECTORY });
    return provider;
  }
  // clubedge:end
  provider = createS3Storage({
    bucket: env.STORAGE_BUCKET || undefined,
    region: env.STORAGE_REGION,
    endpoint: env.STORAGE_ENDPOINT || undefined,
    accessKeyId: env.STORAGE_ACCESS_KEY_ID || undefined,
    secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY || undefined,
    publicUrl: env.STORAGE_PUBLIC_URL || undefined,
  });
  return provider;
}

/** The configured storage provider, resolved on first use so imports stay side-effect free. */
const storage: StorageProvider = withSpans("storage", {
  upload: (input) => resolveProvider().upload(input),
  download: (key) => resolveProvider().download(key),
  delete: (key) => resolveProvider().delete(key),
  exists: (key) => resolveProvider().exists(key),
  getSignedUrl: (key, options) => resolveProvider().getSignedUrl(key, options),
});

/**
 * File storage for a route. S3 credentials belong to the API, so every request shares one
 * provider; Supabase Storage's variant acts as the request's user instead.
 */
export function getStorage(_request: Request): StorageProvider {
  void _request;
  return storage;
}

import "@tanstack/react-start/server-only";
import { z } from "zod";
import type { StorageProvider } from "@clubedge/storage";
import { createS3Storage } from "@clubedge/storage-s3";
import { optional, parseEnv } from "@/env/server";

export type { SignedUrlOptions, StorageProvider, UploadInput } from "@clubedge/storage";

// S3-compatible storage: AWS S3, Cloudflare R2, MinIO, and similar services.
const storageEnvSchema = z.object({
  STORAGE_BUCKET: optional(z.string()),
  STORAGE_REGION: z.string().default("auto"),
  STORAGE_ENDPOINT: optional(z.url()),
  STORAGE_ACCESS_KEY_ID: optional(z.string()),
  STORAGE_SECRET_ACCESS_KEY: optional(z.string()),
  STORAGE_PUBLIC_URL: optional(z.url()),
});

let provider: StorageProvider | undefined;

function resolveProvider(): StorageProvider {
  if (provider) return provider;
  const env = parseEnv(storageEnvSchema, "Storage");
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
export const storage: StorageProvider = {
  upload: (input) => resolveProvider().upload(input),
  download: (key) => resolveProvider().download(key),
  delete: (key) => resolveProvider().delete(key),
  exists: (key) => resolveProvider().exists(key),
  getSignedUrl: (key, options) => resolveProvider().getSignedUrl(key, options),
};

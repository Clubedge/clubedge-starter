import "server-only";
import type { StorageProvider } from "@clubedge/storage";
import { createS3Storage } from "@clubedge/storage/s3";
import { createSupabaseStorage } from "@clubedge/storage/supabase";
import { getServerEnv } from "@/env/server";
import { getSupabaseClient } from "./auth";

export type { SignedUrlOptions, StorageProvider, UploadInput } from "@clubedge/storage";

let provider: StorageProvider | undefined;

function resolveProvider(): StorageProvider {
  if (provider) return provider;
  const env = getServerEnv();
  provider =
    env.STORAGE_PROVIDER === "supabase"
      ? createSupabaseStorage({
          bucket: env.SUPABASE_STORAGE_BUCKET || undefined,
          getClient: getSupabaseClient,
        })
      : createS3Storage({
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

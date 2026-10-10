import "@tanstack/react-start/server-only";
import { z } from "zod";
import type { StorageProvider } from "@clubedge/storage";
import { createSupabaseStorage } from "@clubedge/storage-supabase";
import { optional, parseEnv } from "@/env/server";
import { getSupabaseClient } from "@/server/auth";

export type { SignedUrlOptions, StorageProvider, UploadInput } from "@clubedge/storage";

// Supabase Storage, through the request-scoped Supabase client, so bucket policies can use
// the signed-in user.
const storageEnvSchema = z.object({
  SUPABASE_STORAGE_BUCKET: optional(z.string()),
});

let provider: StorageProvider | undefined;

function resolveProvider(): StorageProvider {
  if (provider) return provider;
  const env = parseEnv(storageEnvSchema, "Storage");
  provider = createSupabaseStorage({
    bucket: env.SUPABASE_STORAGE_BUCKET || undefined,
    getClient: getSupabaseClient,
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

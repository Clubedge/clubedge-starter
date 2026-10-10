import "server-only";
import { getServerEnv } from "@/env/server";
import { s3Storage } from "./s3";
import { supabaseStorage } from "./supabase";
import type { StorageProvider } from "./types";

export type { StorageProvider, UploadInput, SignedUrlOptions } from "./types";

function provider(): StorageProvider {
  return getServerEnv().STORAGE_PROVIDER === "supabase" ? supabaseStorage : s3Storage;
}

/** Delegates to the configured provider, resolved per call so imports stay side-effect free. */
export const storage: StorageProvider = {
  upload: (input) => provider().upload(input),
  download: (key) => provider().download(key),
  delete: (key) => provider().delete(key),
  exists: (key) => provider().exists(key),
  getSignedUrl: (key, options) => provider().getSignedUrl(key, options),
};

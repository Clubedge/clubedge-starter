import "server-only";
import { env } from "@/env/server";
import { s3Storage } from "./s3";
import { supabaseStorage } from "./supabase";
import type { StorageProvider } from "./types";

export type { StorageProvider, UploadInput, SignedUrlOptions } from "./types";
export const storage: StorageProvider =
  env.STORAGE_PROVIDER === "supabase" ? supabaseStorage : s3Storage;

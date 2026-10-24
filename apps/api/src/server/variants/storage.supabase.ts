import { z } from "zod";
import type { StorageProvider } from "@clubedge/storage";
import { createSupabaseStorage } from "@clubedge/storage-supabase";
import { createSupabaseBearerClient } from "@clubedge/auth-supabase";
import { withSpans } from "@clubedge/core";
import { optional, parseEnv } from "@/env";

export type { SignedUrlOptions, StorageProvider, UploadInput } from "@clubedge/storage";

// Supabase Storage, through a Supabase client that carries the request's access token, so
// bucket policies can use the signed-in user.
const storageEnvSchema = z.object({
  SUPABASE_URL: optional(z.url()),
  SUPABASE_PUBLISHABLE_KEY: optional(z.string()),
  SUPABASE_STORAGE_BUCKET: optional(z.string()),
});

type StorageEnv = z.infer<typeof storageEnvSchema>;

let cached: StorageEnv | undefined;

function storageEnv(): StorageEnv {
  cached ??= parseEnv(storageEnvSchema, "Storage");
  return cached;
}

/** The browser's Supabase access token, sent as `Authorization: Bearer <token>`. */
function bearerToken(request: Request): string | undefined {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "");
  return match?.[1];
}

/**
 * File storage for a route, acting as the request's user: Storage row-level security policies
 * apply, and a request without a token is anonymous.
 */
export function getStorage(request: Request): StorageProvider {
  const provider = createSupabaseStorage({
    bucket: storageEnv().SUPABASE_STORAGE_BUCKET || undefined,
    getClient: () => {
      const env = storageEnv();
      if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
        throw new Error("SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be configured.");
      }
      return createSupabaseBearerClient(
        env.SUPABASE_URL,
        env.SUPABASE_PUBLISHABLE_KEY,
        bearerToken(request),
      );
    },
  });
  return withSpans("storage", {
    upload: (input) => provider.upload(input),
    download: (key) => provider.download(key),
    delete: (key) => provider.delete(key),
    exists: (key) => provider.exists(key),
    getSignedUrl: (key, options) => provider.getSignedUrl(key, options),
  });
}

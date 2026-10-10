import type { SupabaseClient } from "@supabase/supabase-js";
import type { StorageProvider, UploadInput } from "./types";

export interface SupabaseStorageConfig {
  /** Optional so the app can start without storage; operations fail until it is set. */
  bucket?: string;
  /**
   * Returns a Supabase client for the current request. Passing the user's session client
   * keeps Storage row-level security policies in effect.
   */
  getClient: () => Promise<Pick<SupabaseClient, "storage">> | Pick<SupabaseClient, "storage">;
}

function toBlob(body: UploadInput["body"], type: string) {
  if (body instanceof Blob) return body;
  if (body instanceof ArrayBuffer) return new Blob([body], { type });
  if (body instanceof Uint8Array) return new Blob([body.slice().buffer], { type });
  throw new Error("Supabase Storage uploads require a Blob or byte array.");
}

export function createSupabaseStorage({
  bucket,
  getClient,
}: SupabaseStorageConfig): StorageProvider {
  function bucketName() {
    if (!bucket) throw new Error("SUPABASE_STORAGE_BUCKET must be configured.");
    return bucket;
  }

  return {
    async upload({ key, body, contentType }) {
      const supabase = await getClient();
      const { error } = await supabase.storage
        .from(bucketName())
        .upload(key, toBlob(body, contentType), { contentType, upsert: false });
      if (error) throw error;
      return { key };
    },
    async download(key) {
      const supabase = await getClient();
      const { data, error } = await supabase.storage.from(bucketName()).download(key);
      if (error) throw error;
      return data.stream() as ReadableStream<Uint8Array>;
    },
    async delete(key) {
      const supabase = await getClient();
      const { error } = await supabase.storage.from(bucketName()).remove([key]);
      if (error) throw error;
    },
    async exists(key) {
      const supabase = await getClient();
      const pieces = key.split("/");
      const name = pieces.pop();
      const { data, error } = await supabase.storage
        .from(bucketName())
        .list(pieces.join("/"), { search: name });
      if (error) throw error;
      return data.some((file) => file.name === name);
    },
    async getSignedUrl(key, options) {
      const supabase = await getClient();
      const { data, error } = await supabase.storage
        .from(bucketName())
        .createSignedUrl(key, options?.expiresInSeconds ?? 300);
      if (error) throw error;
      return data.signedUrl;
    },
  };
}

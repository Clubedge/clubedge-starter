import "server-only";
import { createSupabaseServerClient } from "@/lib/auth/supabase";
import { getServerEnv } from "@/env/server";
import type { StorageProvider, UploadInput } from "./types";

function bucketName() {
  const bucket = getServerEnv().SUPABASE_STORAGE_BUCKET;
  if (!bucket) throw new Error("SUPABASE_STORAGE_BUCKET must be configured.");
  return bucket;
}

function toBlob(body: UploadInput["body"], type: string) {
  if (body instanceof Blob) return body;
  if (body instanceof ArrayBuffer) return new Blob([body], { type });
  if (body instanceof Uint8Array) return new Blob([body.slice().buffer], { type });
  throw new Error("Supabase Storage uploads require a Blob or byte array.");
}

export const supabaseStorage: StorageProvider = {
  async upload({ key, body, contentType }) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.storage
      .from(bucketName())
      .upload(key, toBlob(body, contentType), { contentType, upsert: false });
    if (error) throw error;
    return { key };
  },
  async download(key) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.storage.from(bucketName()).download(key);
    if (error) throw error;
    return data.stream() as ReadableStream<Uint8Array>;
  },
  async delete(key) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.storage.from(bucketName()).remove([key]);
    if (error) throw error;
  },
  async exists(key) {
    const supabase = await createSupabaseServerClient();
    const pieces = key.split("/");
    const name = pieces.pop();
    const { data, error } = await supabase.storage
      .from(bucketName())
      .list(pieces.join("/"), { search: name });
    if (error) throw error;
    return data.some((file) => file.name === name);
  },
  async getSignedUrl(key, options) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.storage
      .from(bucketName())
      .createSignedUrl(key, options?.expiresInSeconds ?? 300);
    if (error) throw error;
    return data.signedUrl;
  },
};

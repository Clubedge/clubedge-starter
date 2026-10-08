import "server-only";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/env/server";
import type { StorageProvider, UploadInput } from "./types";

function required(value: string | undefined, name: string) {
  if (!value) throw new Error(`${name} must be configured for S3 storage.`);
  return value;
}

const client = new S3Client({
  region: env.STORAGE_REGION,
  ...(env.STORAGE_ENDPOINT ? { endpoint: env.STORAGE_ENDPOINT } : {}),
  credentials:
    env.STORAGE_ACCESS_KEY_ID && env.STORAGE_SECRET_ACCESS_KEY
      ? { accessKeyId: env.STORAGE_ACCESS_KEY_ID, secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY }
      : undefined,
});

function bodyForS3(body: UploadInput["body"]) {
  if (body instanceof Blob) return body.stream();
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  return body;
}

export const s3Storage: StorageProvider = {
  async upload({ key, body, contentType, contentLength }) {
    const bucket = required(env.STORAGE_BUCKET, "STORAGE_BUCKET");
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: bodyForS3(body),
        ContentType: contentType,
        ...(contentLength ? { ContentLength: contentLength } : {}),
      }),
    );
    const url = env.STORAGE_PUBLIC_URL
      ? `${env.STORAGE_PUBLIC_URL.replace(/\/$/, "")}/${key}`
      : undefined;
    return { key, url };
  },
  async download(key) {
    const result = await client.send(
      new GetObjectCommand({ Bucket: required(env.STORAGE_BUCKET, "STORAGE_BUCKET"), Key: key }),
    );
    if (!result.Body) throw new Error(`Storage object not found: ${key}`);
    return result.Body.transformToWebStream() as ReadableStream<Uint8Array>;
  },
  async delete(key) {
    await client.send(
      new DeleteObjectCommand({ Bucket: required(env.STORAGE_BUCKET, "STORAGE_BUCKET"), Key: key }),
    );
  },
  async exists(key) {
    try {
      await client.send(
        new HeadObjectCommand({ Bucket: required(env.STORAGE_BUCKET, "STORAGE_BUCKET"), Key: key }),
      );
      return true;
    } catch (error) {
      if (error && typeof error === "object" && "name" in error && error.name === "NotFound")
        return false;
      throw error;
    }
  },
  async getSignedUrl(key, options) {
    const command = new GetObjectCommand({
      Bucket: required(env.STORAGE_BUCKET, "STORAGE_BUCKET"),
      Key: key,
    });
    return getSignedUrl(client, command, { expiresIn: options?.expiresInSeconds ?? 300 });
  },
};

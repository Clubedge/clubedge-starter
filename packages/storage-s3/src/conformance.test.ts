import { describeStorage } from "@clubedge/storage/conformance";
import { createS3Storage } from "./index";

// Against a real S3-compatible service (AWS S3, MinIO, s3mock, R2): the STORAGE_* variables from
// .env.example, as docker-compose.dev.yml and CI provide them.
const bucket = process.env.STORAGE_BUCKET;
const endpoint = process.env.STORAGE_ENDPOINT;
const accessKeyId = process.env.STORAGE_ACCESS_KEY_ID;
const secretAccessKey = process.env.STORAGE_SECRET_ACCESS_KEY;
const publicUrl = process.env.STORAGE_PUBLIC_URL;

describeStorage(
  "s3",
  () => ({
    storage: () =>
      createS3Storage({
        bucket: bucket!,
        region: process.env.STORAGE_REGION || "auto",
        ...(endpoint ? { endpoint } : {}),
        ...(accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : {}),
        ...(publicUrl ? { publicUrl } : {}),
      }),
  }),
  { skip: !bucket && "STORAGE_BUCKET is not set", timeoutMs: 60_000 },
);

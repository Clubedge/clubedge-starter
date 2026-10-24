import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { describeStorage } from "@clubedge/storage/conformance";
import { createS3Storage } from "./index";

// Against a real S3-compatible service (AWS S3, MinIO, s3mock, R2): the STORAGE_* variables from
// .env.example, as docker-compose.dev.yml and CI provide them.
const bucket = process.env.STORAGE_BUCKET;
const endpoint = process.env.STORAGE_ENDPOINT;
const region = process.env.STORAGE_REGION || "auto";
const accessKeyId = process.env.STORAGE_ACCESS_KEY_ID;
const secretAccessKey = process.env.STORAGE_SECRET_ACCESS_KEY;
const publicUrl = process.env.STORAGE_PUBLIC_URL;

let ensuring: Promise<void> | undefined;
/** Creates the bucket once, so a fresh service needs no manual setup. */
function ensureBucket() {
  ensuring ??= (async () => {
    const client = new S3Client({
      region,
      ...(endpoint ? { endpoint } : {}),
      forcePathStyle: Boolean(endpoint),
      ...(accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {}),
    });
    try {
      await client.send(new CreateBucketCommand({ Bucket: bucket! }));
    } catch (error) {
      // A service that already has the bucket (or refuses to create it) still works for the tests.
      if (!/BucketAlready|BucketNotFound/i.test((error as Error)?.name ?? "")) throw error;
    }
  })();
  return ensuring;
}

describeStorage(
  "s3",
  () => ({
    storage: async () => {
      await ensureBucket();
      return createS3Storage({
        bucket: bucket!,
        region,
        ...(endpoint ? { endpoint } : {}),
        ...(accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : {}),
        ...(publicUrl ? { publicUrl } : {}),
      });
    },
  }),
  { skip: !bucket && "STORAGE_BUCKET is not set", timeoutMs: 60_000 },
);

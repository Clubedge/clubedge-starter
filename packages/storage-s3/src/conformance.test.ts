import { CreateBucketCommand, HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import type { CreateBucketConfiguration } from "@aws-sdk/client-s3";
import { describeStorage } from "@clubedge/storage/conformance";
import { createS3Storage } from "./index";

// Against a real S3-compatible service (AWS S3, MinIO, s3mock, R2): the
// STORAGE_* variables from .env.example, as docker-compose.dev.yml and CI
// provide them. Without an explicit region, AWS falls back to its own
// AWS_REGION; only custom endpoints (R2) take the SDK's "auto".
const bucket = process.env.STORAGE_BUCKET;
const endpoint = process.env.STORAGE_ENDPOINT;
const region =
  process.env.STORAGE_REGION || (endpoint ? "auto" : (process.env.AWS_REGION ?? "auto"));
const accessKeyId = process.env.STORAGE_ACCESS_KEY_ID;
const secretAccessKey = process.env.STORAGE_SECRET_ACCESS_KEY;
const publicUrl = process.env.STORAGE_PUBLIC_URL;

let ensuring: Promise<void> | undefined;
/** Creates the bucket only when it is missing, so a provisioned bucket keeps its own configuration. */
function ensureBucket() {
  ensuring ??= (async () => {
    const client = new S3Client({
      region,
      ...(endpoint ? { endpoint } : {}),
      forcePathStyle: Boolean(endpoint),
      ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
    });
    try {
      await client.send(new HeadBucketCommand({ Bucket: bucket! }));
      return;
    } catch (error) {
      const { name, $metadata } = error as Error & { $metadata?: { httpStatusCode?: number } };
      // Anything but "not found" means the bucket exists (or is not ours to create): use it as is.
      if (!/NotFound/i.test(name ?? "") && $metadata?.httpStatusCode !== 404) return;
    }
    await client
      .send(
        new CreateBucketCommand({
          Bucket: bucket!,
          // AWS rejects creating a bucket outside us-east-1 without its location; S3-compatible
          // services take no such parameter.
          ...(endpoint || region === "us-east-1"
            ? {}
            : {
                CreateBucketConfiguration: {
                  LocationConstraint: region as CreateBucketConfiguration["LocationConstraint"],
                },
              }),
        }),
      )
      .catch((error) => {
        // Another run created it between the check and the create.
        if (!/BucketAlready/i.test((error as Error)?.name ?? "")) throw error;
      });
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

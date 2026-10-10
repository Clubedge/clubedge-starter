import { z } from "zod";

const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z
    .url({ protocol: /^rediss?$/ })
    .optional()
    .or(z.literal("")),
  STORAGE_PROVIDER: z.enum(["s3", "supabase"]).default("s3"),
  STORAGE_BUCKET: z.string().optional().or(z.literal("")),
  STORAGE_REGION: z.string().default("auto"),
  STORAGE_ENDPOINT: z.url().optional().or(z.literal("")),
  STORAGE_ACCESS_KEY_ID: z.string().optional().or(z.literal("")),
  STORAGE_SECRET_ACCESS_KEY: z.string().optional().or(z.literal("")),
  STORAGE_PUBLIC_URL: z.url().optional().or(z.literal("")),
  SUPABASE_STORAGE_BUCKET: z.string().optional().or(z.literal("")),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

/**
 * Validates server variables on first use rather than at import, so pages that never touch
 * the database or providers can build and render without them.
 */
export function getServerEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid server environment:", z.treeifyError(parsed.error));
    throw new Error("Server environment validation failed. Check your .env.local file.");
  }
  cached = parsed.data;
  return cached;
}

export function hasRedisConfig() {
  return Boolean(process.env.REDIS_URL);
}

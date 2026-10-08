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

const parsed = serverSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid server environment:", z.treeifyError(parsed.error));
  throw new Error("Server environment validation failed. Check your .env.local file.");
}

export const env = parsed.data;

export function hasRedisConfig() {
  return Boolean(env.REDIS_URL);
}

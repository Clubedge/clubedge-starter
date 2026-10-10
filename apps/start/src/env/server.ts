import { z } from "zod";

const optional = <T extends z.ZodType>(schema: T) => schema.optional().or(z.literal(""));

const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SUPABASE_URL: optional(z.url()),
  SUPABASE_PUBLISHABLE_KEY: optional(z.string()),
  REDIS_URL: optional(z.url({ protocol: /^rediss?$/ })),
  STORAGE_PROVIDER: z.enum(["s3", "supabase"]).default("s3"),
  STORAGE_BUCKET: optional(z.string()),
  STORAGE_REGION: z.string().default("auto"),
  STORAGE_ENDPOINT: optional(z.url()),
  STORAGE_ACCESS_KEY_ID: optional(z.string()),
  STORAGE_SECRET_ACCESS_KEY: optional(z.string()),
  STORAGE_PUBLIC_URL: optional(z.url()),
  SUPABASE_STORAGE_BUCKET: optional(z.string()),
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

/** The public origin used in emailed links. Validates only APP_URL. */
export function getAppUrl(): string {
  const parsed = serverSchema.shape.APP_URL.safeParse(process.env.APP_URL || undefined);
  if (!parsed.success) throw new Error("APP_URL must be an absolute URL.");
  return parsed.data;
}

export interface SupabaseAuthEnv {
  url: string;
  publishableKey: string;
}

/** Supabase Auth settings, or null while they are not configured. Validates only those keys. */
export function getSupabaseAuthEnv(): SupabaseAuthEnv | null {
  const url = serverSchema.shape.SUPABASE_URL.safeParse(process.env.SUPABASE_URL);
  if (!url.success) throw new Error("SUPABASE_URL must be an absolute URL.");
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  return url.data && publishableKey ? { url: url.data, publishableKey } : null;
}

/** Validates only REDIS_URL, so cache and rate limiting work without the rest of the env. */
export function getRedisUrl(): string | undefined {
  const parsed = serverSchema.shape.REDIS_URL.safeParse(process.env.REDIS_URL);
  if (!parsed.success) throw new Error("REDIS_URL must be a redis:// or rediss:// URL.");
  return parsed.data || undefined;
}

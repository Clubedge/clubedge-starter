import { z } from "zod";

/** An optional variable that may also be present but empty, as in a copied .env.example. */
export const optional = <T extends z.ZodType>(schema: T) => schema.optional().or(z.literal(""));

/**
 * Validates one module's variables, naming the module in the error. Each provider module in
 * src/server declares its own schema, so a project without that module has no such variables.
 */
export function parseEnv<T extends z.ZodType>(schema: T, module: string): z.infer<T> {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    console.error(`Invalid ${module} environment:`, z.treeifyError(parsed.error));
    throw new Error(`${module} environment validation failed. Check your .env.local file.`);
  }
  return parsed.data;
}

const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

/**
 * Validates the core server variables on first use rather than at import, so pages that never
 * touch the database can build and render without them.
 */
export function getServerEnv(): ServerEnv {
  cached ??= parseEnv(serverSchema, "Server");
  return cached;
}

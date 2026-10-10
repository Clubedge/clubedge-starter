import { z } from "zod";

const clientSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
});

const parsed = clientSchema.safeParse({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || undefined,
});

if (!parsed.success) {
  throw new Error("Client environment validation failed. Check your NEXT_PUBLIC_* variables.");
}

export const clientEnv = parsed.data;

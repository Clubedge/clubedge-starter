import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { AuthUser } from "@/server/auth";

// This project was created without authentication, so every page renders for everyone.

export const getPageUser = createServerFn({ method: "GET" })
  .validator(z.object({ pathname: z.string() }))
  .handler(async (): Promise<AuthUser | null> => null);

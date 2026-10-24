// The composition root: the only place that reads env and picks providers. Routes in src/app.ts
// receive what they need from here, so tests can give them stand-ins.
import { siteConfig } from "@/config/site";
import type { ApiDependencies } from "@/app";
import { getCurrentUser } from "./auth";
import { createRateLimiter } from "./cache";
import { isReady } from "./db";
import { browserErrorReporting } from "./observability"; // clubedge:only observability!=none

const supabase = {
  url: process.env.SUPABASE_URL ?? "",
  publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY ?? "",
};

export const dependencies: ApiDependencies = {
  serviceId: siteConfig.serviceId,
  frontendOrigin: process.env.FRONTEND_URL ?? "http://localhost:3000",
  isReady,
  getCurrentUser: (request) => getCurrentUser(request, supabase),
  createRateLimiter,
  browserErrorReporting, // clubedge:only observability!=none
};

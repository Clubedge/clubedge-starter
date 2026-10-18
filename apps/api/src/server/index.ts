// The composition root: the only place that reads env and picks providers. Routes in src/app.ts
// receive what they need from here, so tests can give them stand-ins.
import { siteConfig } from "@/config/site";
import type { ApiDependencies } from "@/app";
import { getCurrentUser } from "./auth";
import { isReady } from "./db";

export const dependencies: ApiDependencies = {
  serviceId: siteConfig.serviceId,
  isReady,
  getCurrentUser,
};

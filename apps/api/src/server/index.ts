// The composition root: the only place that reads env and picks providers. Routes in src/app.ts
// receive what they need from here, so tests can give them stand-ins.
import { parseClientIpSettings } from "@clubedge/core";
import { siteConfig } from "@/config/site";
import type { ApiDependencies } from "@/app";
import { account } from "./account"; // clubedge:only auth!=none
import { appVersion } from "./app-version";
import { getCurrentUser } from "./auth";
import { handleAuthRequest } from "./auth"; // clubedge:only framework=none && auth=better-auth
import { createRateLimiter } from "./cache";
import { isReady } from "./db";
import { backgroundJobs } from "./jobs"; // clubedge:only jobs!=none
import { browserErrorReporting } from "./observability"; // clubedge:only observability!=none
import { push } from "./push"; // clubedge:only push!=none
// clubedge:if payments!=none
import { appUrl, getBilling, isPaymentsConfigured } from "./payments";
import { getUserProfileId } from "./users";
// clubedge:end

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
  appVersion,
  // Read at startup: a CLIENT_IP_HEADER or TRUSTED_PROXY_HOPS that cannot be right stops the API.
  clientIpSettings: parseClientIpSettings(process.env),
  account, // clubedge:only auth!=none
  authHandler: handleAuthRequest, // clubedge:only framework=none && auth=better-auth
  browserErrorReporting, // clubedge:only observability!=none
  jobs: backgroundJobs, // clubedge:only jobs!=none
  payments: { isPaymentsConfigured, getBilling, getUserProfileId, appUrl }, // clubedge:only payments!=none
  push, // clubedge:only push!=none
};

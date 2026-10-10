import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { safeRedirectPath } from "@clubedge/core";
import { loginUrl } from "@/lib/login-url";
import { getCurrentUser, isAuthConfigured } from "./auth";

// Server functions are RPC endpoints that route loaders call. The build replaces their
// bodies with network stubs in the browser bundle, so this file is safe to import anywhere.

/**
 * For pages: redirects signed-out visitors to the login page and back afterwards.
 * Returns null while authentication is not configured so the starter stays explorable.
 */
export const getPageUser = createServerFn({ method: "GET" })
  .validator(z.object({ pathname: z.string() }))
  .handler(async ({ data }) => {
    if (!isAuthConfigured()) return null;
    const user = await getCurrentUser();
    if (!user) throw redirect({ href: loginUrl({ next: safeRedirectPath(data.pathname) }) });
    return user;
  });

/** Lets the login page explain that authentication still needs configuring. */
export const getAuthStatus = createServerFn({ method: "GET" }).handler(() => ({
  configured: isAuthConfigured(),
}));

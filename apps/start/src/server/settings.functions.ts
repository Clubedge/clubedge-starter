import { createServerFn } from "@tanstack/react-start";
import { redirect } from "@tanstack/react-router";
import { getDisplayName } from "@clubedge/db";
import { loginUrl } from "@/lib/login-url";
import { getAuth, getCurrentUser, isAuthConfigured } from "./auth";
import { getDb } from "./db";
import { getUserProfileId } from "./users";

/**
 * What the settings page shows. Signed-out visitors go to the login page; without auth
 * configured there is no account to manage.
 */
export const getSettings = createServerFn({ method: "GET" }).handler(async () => {
  if (!isAuthConfigured()) return { configured: false as const };
  const user = await getCurrentUser();
  if (!user?.email) throw redirect({ href: loginUrl({ next: "/settings" }) });
  const profileId = await getUserProfileId({ ...user, email: user.email });
  return {
    configured: true as const,
    email: user.email,
    displayName: await getDisplayName(getDb(), profileId),
    canDeleteAccount: getAuth().canDeleteAccount,
  };
});

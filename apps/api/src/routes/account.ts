// The account settings page's endpoints: the display name the app keeps, and account deletion.
// Password changes stay with the auth provider (its browser SDK, or Better Auth's server), as
// sign-in does; deleting an account needs the server, which removes the app's data as well.
import { Hono, type Context, type MiddlewareHandler } from "hono";
import { z } from "zod";
import type { Account, User } from "@clubedge/contract";
import { reportError } from "@clubedge/core";
import type { ApiDependencies } from "@/app";
import { apiError, jsonOnly, limitBody } from "@/http";
import { createMemoryLimiter } from "@/rate-limit";

/** How deleting an account ended, from the provider's password check onwards. */
export type AccountDeletionResult =
  "deleted" | "invalid-password" | "rate-limited" | "active-subscription" | "not-supported";

/** What the auth provider's deleteAccount (src/server/auth) is given. */
export interface ProviderAccountDeletion {
  user: User;
  password: string;
  request: Request;
  /** Removes the app's data for the user; runs after the password check, before the deletion. */
  beforeDelete(): Promise<void>;
}

/** What the routes need from the composition root (src/server/account). */
export interface AccountService {
  /** Whether deleteAccount works with this server's settings. */
  canDeleteAccount(): boolean;
  getDisplayName(user: User): Promise<string | null>;
  setDisplayName(user: User, displayName: string | null): Promise<void>;
  /**
   * Checks the password with the provider, removes the app's data for the user, then deletes
   * the user from the provider, which ends its sessions.
   */
  deleteAccount(input: {
    user: User;
    password: string;
    request: Request;
  }): Promise<AccountDeletionResult>;
}

const MAX_BODY = 4_096;

const profileSchema = z.object({ displayName: z.string().trim().max(80) });
const deletionSchema = z.object({ password: z.string().min(1).max(128) });

type Env = { Variables: { user: User } };

/** The body as JSON, or null. Read outside the try: limitBody answers 413 for a large one. */
async function readJson(c: Context): Promise<unknown> {
  const body = await c.req.text();
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

export function accountRoutes(dependencies: ApiDependencies) {
  // Password checks, per user, so a stolen session cannot guess the password.
  const limiter = (dependencies.createRateLimiter ?? createMemoryLimiter)(10, 60);

  const signedIn: MiddlewareHandler<Env> = async (c, next) => {
    c.header("Cache-Control", "no-store");
    const user = await dependencies.getCurrentUser(c.req.raw);
    if (!user) return apiError(c, 401, "unauthorized", "Sign in first.");
    c.set("user", user);
    await next();
  };

  const service = () => dependencies.account ?? null;
  const notConfigured = "Account settings are not configured on this server.";

  return new Hono<Env>()
    .get("/api/account", signedIn, async (c) => {
      const account = service();
      if (!account) return apiError(c, 503, "not_configured", notConfigured);
      const user = c.get("user");
      return c.json<Account>({
        email: user.email,
        displayName: await account.getDisplayName(user),
        canDeleteAccount: account.canDeleteAccount(),
      });
    })
    .post("/api/account/profile", jsonOnly, limitBody(MAX_BODY), signedIn, async (c) => {
      const account = service();
      if (!account) return apiError(c, 503, "not_configured", notConfigured);
      const parsed = profileSchema.safeParse(await readJson(c));
      if (!parsed.success) {
        return apiError(c, 400, "invalid_input", "A display name has up to 80 characters.");
      }
      await account.setDisplayName(c.get("user"), parsed.data.displayName || null);
      return c.body(null, 204);
    })
    .post("/api/account/delete", jsonOnly, limitBody(MAX_BODY), signedIn, async (c) => {
      const account = service();
      if (!account?.canDeleteAccount()) {
        return apiError(c, 503, "not_configured", "Deleting accounts is not set up here.");
      }
      const user = c.get("user");
      let limit;
      try {
        limit = await limiter.limit(`account:${user.id}`);
      } catch (error) {
        // Fail closed: without a working limit, password guesses would be unlimited.
        reportError(error, { message: "Rate limiter unavailable" });
        return apiError(c, 503, "unavailable", "Password checks are unavailable right now.");
      }
      if (!limit.success) {
        const seconds = Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1_000));
        c.header("Retry-After", String(seconds));
        return apiError(c, 429, "rate_limited", "Too many attempts. Try again later.");
      }
      const parsed = deletionSchema.safeParse(await readJson(c));
      if (!parsed.success) return apiError(c, 400, "invalid_input", "Enter your password.");

      const result = await account.deleteAccount({
        user,
        password: parsed.data.password,
        request: c.req.raw,
      });
      switch (result) {
        case "deleted":
          return c.body(null, 204);
        case "invalid-password":
          return apiError(c, 403, "invalid_password", "That password is not correct.");
        case "rate-limited":
          return apiError(c, 429, "rate_limited", "Too many attempts. Try again later.");
        case "active-subscription":
          return apiError(c, 409, "active_subscription", "Cancel the subscription first.");
        case "not-supported":
          return apiError(c, 503, "not_configured", "Deleting accounts is not set up here.");
      }
    });
}

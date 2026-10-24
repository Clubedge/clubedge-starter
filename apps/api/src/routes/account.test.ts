import { describe, expect, it } from "vitest";
import type { User } from "@clubedge/contract";
import { createApp } from "@/app";
import type { CreateRateLimiter } from "@/rate-limit";
import type { AccountDeletionResult, AccountService } from "./account";

const ada: User = { id: "auth-ada", email: "ada@example.com", displayName: null };

/** An account service kept in memory, with the deletion result the test picks. */
function memoryAccount(result: AccountDeletionResult = "deleted", canDelete = true) {
  const names = new Map<string, string | null>();
  const deleted: Array<{ user: User; password: string }> = [];
  const account: AccountService = {
    canDeleteAccount: () => canDelete,
    getDisplayName: async (user) => names.get(user.id) ?? null,
    setDisplayName: async (user, displayName) => void names.set(user.id, displayName),
    deleteAccount: async ({ user, password }) => {
      deleted.push({ user, password });
      return result;
    },
  };
  return { account, deleted };
}

function appWith(account: AccountService, createRateLimiter?: CreateRateLimiter) {
  return createApp({
    serviceId: "my-product",
    isReady: async () => true,
    getCurrentUser: async (request) => (request.headers.get("authorization") ? ada : null),
    account,
    ...(createRateLimiter ? { createRateLimiter } : {}),
  });
}

const post = (body: unknown) => ({
  method: "POST",
  headers: { authorization: "Bearer ada", "content-type": "application/json" },
  body: JSON.stringify(body),
});

describe("/api/account", () => {
  it("shows the account, with the display name the app keeps", async () => {
    const app = appWith(memoryAccount().account);
    expect((await app.request("/api/account/profile", post({ displayName: " Ada " }))).status).toBe(
      204,
    );
    const response = await app.request("/api/account", { headers: { authorization: "Bearer" } });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({
      email: "ada@example.com",
      displayName: "Ada",
      canDeleteAccount: true,
    });
  });

  it("clears the display name with an empty one and refuses a long one", async () => {
    const { account } = memoryAccount();
    const app = appWith(account);
    await app.request("/api/account/profile", post({ displayName: "Ada" }));
    await app.request("/api/account/profile", post({ displayName: "  " }));
    expect(await account.getDisplayName(ada)).toBeNull();
    const response = await app.request(
      "/api/account/profile",
      post({ displayName: "x".repeat(81) }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "invalid_input" } });
  });

  it("deletes the account after the provider checks the password", async () => {
    const { account, deleted } = memoryAccount();
    const response = await appWith(account).request(
      "/api/account/delete",
      post({ password: "pw" }),
    );
    expect(response.status).toBe(204);
    expect(deleted).toEqual([{ user: ada, password: "pw" }]);
  });

  it.each([
    ["invalid-password", 403, "invalid_password"],
    ["active-subscription", 409, "active_subscription"],
    ["rate-limited", 429, "rate_limited"],
    ["not-supported", 503, "not_configured"],
  ] as const)("answers %s with %i", async (result, status, code) => {
    const response = await appWith(memoryAccount(result).account).request(
      "/api/account/delete",
      post({ password: "pw" }),
    );
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ error: { code } });
  });

  it("refuses to delete where deleting is not set up, before checking anything", async () => {
    const { account, deleted } = memoryAccount("deleted", false);
    const response = await appWith(account).request(
      "/api/account/delete",
      post({ password: "pw" }),
    );
    expect(response.status).toBe(503);
    expect(deleted).toEqual([]);
  });

  it("needs a password", async () => {
    const response = await appWith(memoryAccount().account).request(
      "/api/account/delete",
      post({ password: "" }),
    );
    expect(response.status).toBe(400);
  });

  it("limits password checks per user, with Retry-After", async () => {
    const { account, deleted } = memoryAccount("invalid-password");
    const app = appWith(account);
    for (let attempt = 0; attempt < 10; attempt++) {
      expect((await app.request("/api/account/delete", post({ password: "guess" }))).status).toBe(
        403,
      );
    }
    const response = await app.request("/api/account/delete", post({ password: "guess" }));
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(deleted).toHaveLength(10);
  });

  it("refuses password checks while the limit cannot be checked", async () => {
    const { account, deleted } = memoryAccount();
    const broken: CreateRateLimiter = () => ({
      limit: async () => {
        throw new Error("Redis is down");
      },
    });
    const response = await appWith(account, broken).request(
      "/api/account/delete",
      post({ password: "pw" }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: "unavailable" } });
    expect(deleted).toEqual([]);
  });
});

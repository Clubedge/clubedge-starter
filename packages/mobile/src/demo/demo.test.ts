import { beforeEach, describe, expect, it } from "vitest";
import { api } from "./api";
import { authClient } from "./auth";
import { demo } from "./state";

beforeEach(() => {
  demo.user = null;
  demo.displayName = null;
});

const signIn = () => authClient.signIn("ada@example.com");

describe("the demo's sign-in", () => {
  it("signs in with any email and password, and out", async () => {
    expect((await api.GET("/api/session")).data).toEqual({ user: null });
    await signIn();
    expect((await api.GET("/api/session")).data?.user?.email).toBe("ada@example.com");
    await authClient.signOut();
    expect((await api.GET("/api/session")).data).toEqual({ user: null });
  });

  it("explains that sign-up and password reset are off", async () => {
    await expect(authClient.signUp()).rejects.toThrow("Sign-up is off in the demo");
    await expect(authClient.requestPasswordReset()).rejects.toThrow("off in the demo");
    await expect(authClient.resetPassword()).rejects.toThrow("off in the demo");
    expect(demo.user).toBeNull();
  });
});

describe("the demo's API", () => {
  it("keeps the settings in memory", async () => {
    expect((await api.GET("/api/account")).response.status).toBe(401);
    await signIn();
    const save = (displayName: string) =>
      api.POST("/api/account/profile", { body: { displayName } });
    expect((await save("  Ada  ")).response.status).toBe(204);
    expect((await api.GET("/api/account")).data).toEqual({
      email: "ada@example.com",
      displayName: "Ada",
      canDeleteAccount: true,
    });
    expect((await save("x".repeat(81))).error?.error.code).toBe("invalid_input");
    expect((await save(" ")).response.status).toBe(204);
    expect((await api.GET("/api/account")).data?.displayName).toBeNull();
  });

  it("deletes the account, which signs the user out", async () => {
    await signIn();
    const remove = (password: string) => api.POST("/api/account/delete", { body: { password } });
    expect((await remove("")).error?.error.code).toBe("invalid_input");
    expect((await remove("anything")).response.status).toBe(204);
    expect((await api.GET("/api/session")).data).toEqual({ user: null });
  });

  it("runs sample jobs, newest first", async () => {
    const before = (await api.GET("/api/jobs")).data!;
    expect(before.runner).toBe("worker");
    expect(before.jobs?.[0]?.state).toBe("completed");
    const queued = (await api.POST("/api/jobs/sample", { body: {} })).data!;
    const after = (await api.GET("/api/jobs")).data!;
    expect(after.jobs?.[0]).toMatchObject({ id: queued.id, name: "sample", state: "queued" });
  });

  it("answers the app's other routes as an API with nothing set up", async () => {
    expect((await api.GET("/api/ready")).data).toEqual({ status: "ok" });
    expect((await api.GET("/api/health")).data?.status).toBe("ok");
    expect((await api.GET("/api/app-version")).data).toEqual({
      minimumVersion: null,
      latestVersion: null,
      updateUrl: null,
      nextMinimumVersion: null,
      nextMinimumFrom: null,
    });
    expect((await api.GET("/api/billing")).data?.subscription).toBeNull();
    expect((await api.GET("/api/client-errors")).data).toEqual({ provider: "none" });
  });

  it("answers 404 for the routes it leaves out, as for an absent module", async () => {
    const { response, error } = await api.POST("/api/billing/checkout", {
      body: { planId: "pro" },
    });
    expect(response.status).toBe(404);
    expect(error?.error.code).toBe("not_found");
  });
});

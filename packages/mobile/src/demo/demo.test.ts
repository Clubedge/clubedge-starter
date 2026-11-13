import { checkForUpdate, rememberedUpdate, updateStatus } from "@clubedge/contract";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, DEMO_APK } from "./api";
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

describe("the demo's updates", () => {
  const latest = "https://api.github.com/repos/Clubedge/clubedge-starter/releases/latest";
  const download = (tag: string, name: string) =>
    `https://github.com/Clubedge/clubedge-starter/releases/download/${tag}/${name}`;

  /** GitHub's latest release, with these files. */
  const release = (tag: string, files: string[]) =>
    Response.json({
      tag_name: tag,
      assets: files.map((name) => ({ name, browser_download_url: download(tag, name) })),
    });

  /** What GitHub answers the demo, or the error it gets instead. */
  function github(answer: Response | Error) {
    const fetch = vi.fn(async () => {
      if (answer instanceof Error) throw answer;
      return answer;
    });
    vi.stubGlobal("fetch", fetch);
    return fetch;
  }

  const forReleases = () => vi.stubEnv("VITE_DEMO_RELEASES", "Clubedge/clubedge-starter");

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("asks for none in a build for no repository's releases", async () => {
    const fetch = github(release("v0.31.5", [DEMO_APK]));
    expect((await api.GET("/api/app-version")).data?.minimumVersion).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("asks an older demo to update to the latest release's APK", async () => {
    forReleases();
    const fetch = github(release("v0.31.5", ["clubedge-native-demo.apk", DEMO_APK]));
    const versions = (await api.GET("/api/app-version")).data!;
    expect(fetch).toHaveBeenCalledWith(latest, expect.anything());
    expect(versions).toEqual({
      minimumVersion: "0.31.5",
      latestVersion: "0.31.5",
      updateUrl: download("v0.31.5", DEMO_APK),
      nextMinimumVersion: null,
      nextMinimumFrom: null,
    });
    expect(updateStatus("0.31.4", versions)).toBe("required");
    expect(updateStatus("0.31.5", versions)).toBe("current");
  });

  it("can't tell until the latest release carries the demo, or when GitHub can't answer", async () => {
    forReleases();
    for (const answer of [
      release("v0.31.5", ["clubedge-native-demo.apk"]),
      release("nightly", [DEMO_APK]),
      new Response("rate limit exceeded", { status: 403 }),
      new TypeError("Failed to fetch"),
    ]) {
      github(answer);
      const { response, data } = await api.GET("/api/app-version");
      expect(response.status).toBe(503);
      expect(data).toBeUndefined();
    }
  });

  it("keeps a demo it asked to update closed while it can't tell", async () => {
    forReleases();
    const kept = new Map<string, string>();
    const storage = {
      get: async (key: string) => kept.get(key) ?? null,
      set: async (key: string, value: string) => void kept.set(key, value),
      remove: async (key: string) => void kept.delete(key),
    };
    const versions = async () => (await api.GET("/api/app-version")).data ?? null;
    github(release("v0.31.5", [DEMO_APK]));
    expect((await checkForUpdate("0.31.4", versions, storage))?.status).toBe("required");
    github(new TypeError("Failed to fetch"));
    expect(await checkForUpdate("0.31.4", versions, storage)).toBeNull();
    expect((await rememberedUpdate("0.31.4", storage))?.status).toBe("required");
  });
});

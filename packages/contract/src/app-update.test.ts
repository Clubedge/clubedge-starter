import { describe, expect, it, vi } from "vitest";
import {
  appVersionMiddleware,
  checkForUpdate,
  dismiss,
  isDismissed,
  noticeKey,
  rememberedUpdate,
  type UpdateStorage,
} from "./app-update";
import { createApiClient } from "./index";

/** The device's storage, in memory. */
function deviceStorage(): UpdateStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    get: async (key) => values.get(key) ?? null,
    set: async (key, value) => void values.set(key, value),
    remove: async (key) => void values.delete(key),
  };
}

const served = (versions: {
  minimumVersion?: string;
  latestVersion?: string;
  nextMinimumVersion?: string;
}) => ({
  minimumVersion: null,
  latestVersion: null,
  updateUrl: "https://apps.example.com/my-product",
  nextMinimumVersion: null,
  nextMinimumFrom: versions.nextMinimumVersion ? "2026-11-01T00:00:00.000Z" : null,
  ...versions,
});

describe("appVersionMiddleware", () => {
  it("says which version and platform each request comes from", async () => {
    const fetch = vi.fn(async (_request: Request) => Response.json({ user: null }));
    const api = createApiClient({ baseUrl: "https://api.example.com", fetch });
    api.use(appVersionMiddleware({ version: async () => "1.4.0", platform: "ios", onRefused() {} }));
    await api.GET("/api/session");
    const request = fetch.mock.calls[0]![0];
    expect(request.headers.get("X-App-Version")).toBe("1.4.0");
    expect(request.headers.get("X-App-Platform")).toBe("ios");
  });

  it("tells the app when the API refuses its version", async () => {
    const refused = vi.fn();
    const answers = [426, 200];
    const fetch = async () =>
      Response.json({ error: { code: "update_required", message: "Update." } }, {
        status: answers.shift(),
      });
    const api = createApiClient({ baseUrl: "https://api.example.com", fetch });
    api.use(appVersionMiddleware({ version: () => "1.0.0", platform: null, onRefused: refused }));
    await api.GET("/api/session");
    await api.GET("/api/session");
    expect(refused).toHaveBeenCalledTimes(1);
  });
});

describe("checkForUpdate", () => {
  it("answers what the versions call for", async () => {
    const storage = deviceStorage();
    const versions = served({ minimumVersion: "1.0.0", latestVersion: "1.4.0" });
    expect(await checkForUpdate("1.2.0", async () => versions, storage)).toEqual({
      status: "available",
      versions,
    });
  });

  it("remembers a block for the next start offline, until the app is updated", async () => {
    const storage = deviceStorage();
    const versions = served({ minimumVersion: "1.3.0" });
    await checkForUpdate("1.2.0", async () => versions, storage);
    expect(await rememberedUpdate("1.2.0", storage)).toEqual({ status: "required", versions: null });
    expect(await rememberedUpdate("1.3.0", storage)).toBeNull();
  });

  it("forgets the block once the API serves the version again", async () => {
    const storage = deviceStorage();
    await checkForUpdate("1.2.0", async () => served({ minimumVersion: "1.3.0" }), storage);
    await checkForUpdate("1.2.0", async () => served({ minimumVersion: "1.0.0" }), storage);
    expect(await rememberedUpdate("1.2.0", storage)).toBeNull();
  });

  it("changes nothing when the API can't be reached", async () => {
    const storage = deviceStorage();
    await checkForUpdate("1.2.0", async () => served({ minimumVersion: "1.3.0" }), storage);
    const offline = async () => Promise.reject(new TypeError("Network request failed"));
    expect(await checkForUpdate("1.2.0", offline, storage)).toBeNull();
    expect(await checkForUpdate("1.2.0", async () => null, storage)).toBeNull();
    expect(await rememberedUpdate("1.2.0", storage)).not.toBeNull();
  });
});

describe("dismissed notices", () => {
  const morning = new Date("2026-10-26T08:00:00Z");
  const evening = new Date("2026-10-26T20:00:00Z");
  const tomorrow = new Date("2026-10-27T08:00:00Z");

  it("keep an available update dismissed until a newer one is out", async () => {
    const storage = deviceStorage();
    const update = { status: "available" as const, versions: served({ latestVersion: "1.4.0" }) };
    await dismiss(update, storage, morning);
    expect(await isDismissed(update, storage, tomorrow)).toBe(true);
    const newer = { ...update, versions: served({ latestVersion: "1.5.0" }) };
    expect(await isDismissed(newer, storage, tomorrow)).toBe(false);
  });

  it("bring a warning before a minimum's date back each day", async () => {
    const storage = deviceStorage();
    const update = { status: "upcoming" as const, versions: served({ nextMinimumVersion: "1.3.0" }) };
    await dismiss(update, storage, morning);
    expect(await isDismissed(update, storage, evening)).toBe(true);
    expect(await isDismissed(update, storage, tomorrow)).toBe(false);
  });

  it("never apply to a block", () => {
    expect(noticeKey({ status: "required", versions: null })).toBeNull();
    expect(noticeKey({ status: "current", versions: null })).toBeNull();
  });
});

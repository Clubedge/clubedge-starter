import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appVersionMiddleware,
  checkForUpdate,
  createUpdateChecks,
  dismiss,
  isDismissed,
  noticeKey,
  rememberedUpdate,
  UPDATE_CHECK_INTERVAL,
  type UpdateStorage,
} from "./app-update";
import { createApiClient } from "./index";

/** The device's storage, in memory; `failing` makes each call fail, as a full disk would. */
function deviceStorage(failing = false): UpdateStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  const reach = () => {
    if (failing) throw new Error("The device's storage failed.");
  };
  return {
    values,
    get: async (key) => (reach(), values.get(key) ?? null),
    set: async (key, value) => (reach(), void values.set(key, value)),
    remove: async (key) => (reach(), void values.delete(key)),
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

type Served = ReturnType<typeof served>;

/** An API whose answers to GET /api/app-version the test gives, one by one, in any order. */
function slowApi() {
  const answers: Array<(versions: Served | null) => void> = [];
  return {
    answer: (index: number, versions: Served | null) => answers[index]!(versions),
    versions: () => new Promise<Served | null>((resolve) => answers.push(resolve)),
  };
}

/** Lets the checks' pending steps run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("appVersionMiddleware", () => {
  it("says which version and platform each request comes from", async () => {
    let request: Request | undefined;
    const fetch = async (input: RequestInfo | URL) => {
      request = input as Request;
      return Response.json({ user: null });
    };
    const api = createApiClient({ baseUrl: "https://api.example.com", fetch });
    api.use(
      appVersionMiddleware({ version: async () => "1.4.0", platform: "ios", onRefused() {} }),
    );
    await api.GET("/api/session");
    expect(request?.headers.get("X-App-Version")).toBe("1.4.0");
    expect(request?.headers.get("X-App-Platform")).toBe("ios");
  });

  it("sends the request without a version the device can't give", async () => {
    let request: Request | undefined;
    const fetch = async (input: RequestInfo | URL) => {
      request = input as Request;
      return Response.json({ user: null });
    };
    const api = createApiClient({ baseUrl: "https://api.example.com", fetch });
    const version = () => Promise.reject(new Error("The App plugin is not available."));
    api.use(appVersionMiddleware({ version, platform: "android", onRefused() {} }));
    const { response } = await api.GET("/api/session");
    expect(response.status).toBe(200);
    expect(request?.headers.has("X-App-Version")).toBe(false);
  });

  it("tells the app when the API refuses its version", async () => {
    const refused = vi.fn();
    const answers = [426, 200];
    const fetch = async () =>
      Response.json(
        { error: { code: "update_required", message: "Update." } },
        { status: answers.shift() },
      );
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

  it("answers a minimum announced for a date", async () => {
    const storage = deviceStorage();
    const versions = served({
      minimumVersion: "1.0.0",
      nextMinimumVersion: "1.3.0",
      latestVersion: "1.4.0",
    });
    expect(await checkForUpdate("1.2.0", async () => versions, storage)).toEqual({
      status: "upcoming",
      versions,
    });
  });

  it("remembers a block for the next start offline, until the app is updated", async () => {
    const storage = deviceStorage();
    const versions = served({ minimumVersion: "1.3.0" });
    await checkForUpdate("1.2.0", async () => versions, storage);
    expect(await rememberedUpdate("1.2.0", storage)).toEqual({
      status: "required",
      versions: null,
    });
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

  it("answers even when the device can't keep the block", async () => {
    const versions = served({ minimumVersion: "1.3.0" });
    expect(await checkForUpdate("1.2.0", async () => versions, deviceStorage(true))).toEqual({
      status: "required",
      versions,
    });
  });
});

describe("dismissed notices", () => {
  // The user's own clock: a day is theirs, wherever they are.
  const morning = new Date(2026, 9, 26, 8);
  const evening = new Date(2026, 9, 26, 23, 30);
  const tomorrow = new Date(2026, 9, 27, 8);

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
    const update = {
      status: "upcoming" as const,
      versions: served({ nextMinimumVersion: "1.3.0" }),
    };
    await dismiss(update, storage, morning);
    expect(await isDismissed(update, storage, evening)).toBe(true);
    expect(await isDismissed(update, storage, tomorrow)).toBe(false);
  });

  it("of one kind never bring back another", async () => {
    const storage = deviceStorage();
    const available = {
      status: "available" as const,
      versions: served({ latestVersion: "1.4.0" }),
    };
    const upcoming = {
      status: "upcoming" as const,
      versions: served({ nextMinimumVersion: "1.3.0", latestVersion: "1.4.0" }),
    };
    await dismiss(available, storage, morning);
    await dismiss(upcoming, storage, morning);
    expect(await isDismissed(available, storage, morning)).toBe(true);
  });

  it("never apply to a block", () => {
    expect(noticeKey({ status: "required", versions: null })).toBeNull();
    expect(noticeKey({ status: "current", versions: null })).toBeNull();
  });
});

describe("createUpdateChecks", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows the remembered block at once, then what the API answers", async () => {
    const storage = deviceStorage();
    storage.values.set("app-update.required", "1.2.0");
    const api = slowApi();
    const checks = createUpdateChecks({ installed: "1.2.0", versions: api.versions, storage });
    checks.start();
    await settle();
    expect(checks.current()).toEqual({ status: "required", versions: null });
    api.answer(0, served({ minimumVersion: "1.3.0" }));
    await settle();
    expect(checks.current()?.versions?.updateUrl).toBe("https://apps.example.com/my-product");
  });

  it("never lets a slow answer undo a block that came after it", async () => {
    const api = slowApi();
    const checks = createUpdateChecks({
      installed: "1.2.0",
      versions: api.versions,
      storage: deviceStorage(),
    });
    const changes = vi.fn();
    checks.subscribe(changes);
    checks.start();
    await settle();
    checks.refused();
    expect(checks.current()?.status).toBe("required");
    await settle();
    api.answer(1, served({ minimumVersion: "1.3.0" }));
    await settle();
    // The check that began before the refusal, answered from before the minimum changed.
    api.answer(0, served({}));
    await settle();
    expect(checks.current()?.status).toBe("required");
    expect(changes).toHaveBeenCalled();
  });

  it("remembers a refusal for the next start offline, though the check after it fails", async () => {
    const storage = deviceStorage();
    const offline = () => Promise.reject(new TypeError("Network request failed"));
    const refused = createUpdateChecks({ installed: "1.2.0", versions: offline, storage });
    refused.refused();
    await settle();
    const restarted = createUpdateChecks({ installed: "1.2.0", versions: offline, storage });
    restarted.start();
    await settle();
    expect(restarted.current()).toEqual({ status: "required", versions: null });
  });

  it("keeps an answer when a newer check can't reach the API", async () => {
    const api = slowApi();
    let calls = 0;
    const versions = () =>
      ++calls === 2 ? Promise.reject(new TypeError("Network request failed")) : api.versions();
    const checks = createUpdateChecks({ installed: "1.2.0", versions, storage: deviceStorage() });
    checks.start();
    await settle();
    checks.resume();
    await settle();
    api.answer(0, served({ latestVersion: "1.4.0" }));
    await settle();
    expect(checks.current()?.status).toBe("available");
  });

  it("checks again on a return to the app only once the interval has passed", async () => {
    const versions = vi.fn(async () => served({}));
    const checks = createUpdateChecks({ installed: "1.2.0", versions, storage: deviceStorage() });
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    checks.start();
    await settle();
    checks.resume();
    expect(versions).toHaveBeenCalledTimes(1);
    now.mockReturnValue(1_000_000 + UPDATE_CHECK_INTERVAL);
    checks.resume();
    await settle();
    expect(versions).toHaveBeenCalledTimes(2);
  });

  it("hides a notice at the user's Not now, and still shows a block a check brings", async () => {
    const storage = deviceStorage();
    const api = slowApi();
    const checks = createUpdateChecks({ installed: "1.2.0", versions: api.versions, storage });
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    checks.start();
    await settle();
    api.answer(0, served({ latestVersion: "1.4.0" }));
    await settle();
    expect(checks.current()?.status).toBe("available");
    now.mockReturnValue(1_000_000 + UPDATE_CHECK_INTERVAL);
    checks.resume();
    await settle();
    checks.notNow();
    expect(checks.current()).toBeNull();
    api.answer(1, served({ minimumVersion: "1.3.0", latestVersion: "1.4.0" }));
    await settle();
    expect(checks.current()?.status).toBe("required");
    expect(storage.values.get("app-update.dismissed.available")).toBe("available 1.4.0");
  });

  it("works on when the device's storage and version fail", async () => {
    const checks = createUpdateChecks({
      installed: Promise.reject(new Error("The App plugin is not available.")),
      versions: async () => served({ latestVersion: "1.4.0" }),
      storage: deviceStorage(true),
    });
    checks.start();
    checks.refused();
    await settle();
    // Without a version, no answer applies to the app: the refusal's block stays.
    expect(checks.current()?.status).toBe("required");
  });
});

import { describe, expect, it } from "vitest";
import { checkProductionEnv, isLocalUrl, requiredVariables } from "./production";

// A value for every variable this API requires, whichever modules it has.
const complete = () =>
  Object.fromEntries(requiredVariables().map(({ key }) => [key, "https://service.example.com"]));

describe("production env check", () => {
  it("passes when every required variable is set", () => {
    expect(checkProductionEnv(complete())).toEqual({ missing: [], local: [], invalid: [] });
  });

  it("always requires the database and the frontend's URL", () => {
    const keys = checkProductionEnv({}).missing.map(({ key }) => key);
    expect(keys).toContain("DATABASE_URL");
    expect(keys).toContain("FRONTEND_URL");
  });

  it("counts empty values as unset", () => {
    const env = { ...complete(), DATABASE_URL: "  " };
    expect(checkProductionEnv(env).missing.map(({ key }) => key)).toEqual(["DATABASE_URL"]);
  });

  it("rejects URLs to this machine", () => {
    const env = { ...complete(), FRONTEND_URL: "http://localhost:3000" };
    expect(checkProductionEnv(env).local).toEqual(["FRONTEND_URL"]);
  });

  it("checks the optional direct database URL", () => {
    const direct = (value: string) =>
      checkProductionEnv({ ...complete(), DATABASE_URL_DIRECT: value });
    expect(direct("postgresql://u:p@ep-x-1.eu-central-1.aws.neon.tech/neondb")).toEqual({
      missing: [],
      local: [],
      invalid: [],
    });
    expect(direct("postgresql://u:p@localhost:5432/app").local).toEqual(["DATABASE_URL_DIRECT"]);
    expect(direct("https://db.example.com/app").invalid).toEqual([
      "DATABASE_URL_DIRECT is not a postgresql:// URL",
    ]);
    expect(
      direct("postgresql://u:p@ep-x-1-pooler.eu-central-1.aws.neon.tech/neondb").invalid,
    ).toEqual(["DATABASE_URL_DIRECT points at Neon's pooler: use the host without -pooler"]);
  });

  it("rejects a URL that isn't absolute", () => {
    const env = { ...complete(), FRONTEND_URL: "my-app.example.com" };
    expect(checkProductionEnv(env).invalid).toEqual(["FRONTEND_URL is not an absolute URL"]);
  });

  const hasFirebase = requiredVariables().some(({ key }) => key === "FIREBASE_PROJECT_ID");
  it.runIf(hasFirebase)("refuses the Firebase Auth Emulator in production", () => {
    const env = { ...complete(), FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099" };
    expect(checkProductionEnv(env).invalid).toEqual([
      "FIREBASE_AUTH_EMULATOR_HOST is set: production uses your Firebase project, so remove it",
    ]);
  });

  it("tells local URLs from hosted ones", () => {
    expect(isLocalUrl("http://localhost:3000")).toBe(true);
    expect(isLocalUrl("redis://127.0.0.1:6379")).toBe(true);
    expect(isLocalUrl("postgres://u:p@host.docker.internal/app")).toBe(true);
    expect(isLocalUrl("postgresql://u:p@aws-0-eu-west-1.pooler.supabase.com:6543/postgres")).toBe(
      false,
    );
    expect(isLocalUrl("rediss://default:pw@eu1-x.upstash.io:6379")).toBe(false);
    expect(isLocalUrl("not a url")).toBe(false);
  });
});

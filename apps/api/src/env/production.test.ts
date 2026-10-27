import { describe, expect, it } from "vitest";
import { checkProductionEnv, isLocalUrl, requiredVariables } from "./production";

// A value for every variable this API requires, whichever modules it has: a hosted URL, long
// enough for a secret too.
const complete = () =>
  Object.fromEntries(
    requiredVariables().map(({ key }) => [key, "https://service.example.com/0123456789"]),
  );

describe("production env check", () => {
  it("passes when every required variable is set", () => {
    expect(checkProductionEnv(complete())).toEqual({ missing: [], local: [], invalid: [] });
  });

  it("always requires the database", () => {
    const keys = checkProductionEnv({}).missing.map(({ key }) => key);
    expect(keys).toContain("DATABASE_URL");
  });

  // clubedge:if framework!=none
  it("requires the frontend's URL", () => {
    expect(checkProductionEnv({}).missing.map(({ key }) => key)).toContain("FRONTEND_URL");
  });
  // clubedge:end

  it("counts empty values as unset", () => {
    const env = { ...complete(), DATABASE_URL: "  " };
    expect(checkProductionEnv(env).missing.map(({ key }) => key)).toEqual(["DATABASE_URL"]);
  });

  it("rejects URLs to this machine", () => {
    const env = {
      ...complete(),
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/app",
    };
    expect(checkProductionEnv(env).local).toEqual(["DATABASE_URL"]);
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

  it("checks the optional app versions", () => {
    const invalid = (values: Record<string, string>) =>
      checkProductionEnv({ ...complete(), ...values }).invalid;
    expect(
      invalid({
        APP_MINIMUM_VERSION: "1.2.0",
        APP_LATEST_VERSION: "1.10.0",
        APP_UPDATE_URL: "https://apps.example.com/my-product",
      }),
    ).toEqual([]);
    expect(invalid({ APP_MINIMUM_VERSION: "1.2" })).toEqual([
      "APP_MINIMUM_VERSION is not MAJOR.MINOR.PATCH, such as 1.4.0",
    ]);
    expect(invalid({ APP_MINIMUM_VERSION: "1.10.0", APP_LATEST_VERSION: "1.9.0" })).toEqual([
      "APP_LATEST_VERSION is older than APP_MINIMUM_VERSION",
    ]);
    expect(invalid({ APP_UPDATE_URL: "http://apps.example.com/my-product" })).toEqual([
      "APP_UPDATE_URL is not an https:// URL",
    ]);
  });

  // clubedge:if framework!=none
  it("rejects a URL that isn't absolute", () => {
    const env = { ...complete(), FRONTEND_URL: "my-app.example.com" };
    expect(checkProductionEnv(env).invalid).toEqual(["FRONTEND_URL is not an absolute URL"]);
  });
  // clubedge:end

  // clubedge:if auth=better-auth && framework=none
  it("refuses a Better Auth secret shorter than 32 characters", () => {
    const env = { ...complete(), BETTER_AUTH_SECRET: "too-short" };
    expect(checkProductionEnv(env).invalid).toEqual([
      "BETTER_AUTH_SECRET is shorter than 32 characters: use openssl rand -hex 32",
    ]);
  });
  // clubedge:end

  // clubedge:if push=native
  it("refuses a push service with only some of its credentials", () => {
    const fcm = {
      FCM_PROJECT_ID: "my-product",
      FCM_CLIENT_EMAIL: "push@my-product.iam.gserviceaccount.com",
    };
    expect(checkProductionEnv({ ...complete(), ...fcm }).invalid).toContain(
      "FCM needs FCM_PRIVATE_KEY too",
    );
    expect(checkProductionEnv({ ...complete(), ...fcm, FCM_PRIVATE_KEY: "key" }).invalid).toEqual(
      [],
    );
    expect(checkProductionEnv({ ...complete(), APNS_ENVIRONMENT: "staging" }).invalid).toEqual([
      "APNS_ENVIRONMENT must be production or development",
    ]);
  });

  // clubedge:end
  it("checks where rate limits find the client's address", () => {
    const env = { ...complete(), TRUSTED_PROXY_HOPS: "1" };
    expect(checkProductionEnv(env).invalid).toEqual([]);
    expect(checkProductionEnv({ ...env, CLIENT_IP_HEADER: "x real ip" }).invalid).toEqual([
      'CLIENT_IP_HEADER must be a header name, such as x-real-ip, not "x real ip"',
    ]);
  });

  const hasInngest = requiredVariables().some(({ key }) => key === "INNGEST_SIGNING_KEY");
  it.runIf(hasInngest)("refuses the Inngest Dev Server in production", () => {
    expect(checkProductionEnv({ ...complete(), INNGEST_DEV: "1" }).invalid).toEqual([
      "INNGEST_DEV is set: production uses Inngest Cloud's keys, so remove it",
    ]);
    expect(checkProductionEnv({ ...complete(), INNGEST_DEV: "0" }).invalid).toEqual([]);
  });

  const hasFirebase = requiredVariables().some(({ key }) => key === "FIREBASE_PROJECT_ID");
  it.runIf(hasFirebase)("refuses the Firebase Auth Emulator in production", () => {
    const env = { ...complete(), FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099" };
    expect(checkProductionEnv(env).invalid).toEqual([
      "FIREBASE_AUTH_EMULATOR_HOST is set: production uses your Firebase project, so remove it",
    ]);
  });

  const hasEmail = requiredVariables().some(({ key }) => key === "EMAIL_FROM");
  it.runIf(hasEmail)("refuses .env.example's example.com sender", () => {
    const env = { ...complete(), EMAIL_FROM: "App <no-reply@example.com>" };
    expect(checkProductionEnv(env).invalid).toEqual([
      "EMAIL_FROM still uses example.com: set a sender on a domain you verified",
    ]);
    expect(checkProductionEnv({ ...env, EMAIL_FROM: "App <hi@mail.example.org>" }).invalid).toEqual(
      [],
    );
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

import { describe, expect, it } from "vitest";
import { checkProductionEnv, isLocalUrl, requiredVariables } from "./production";

// A value for every variable this project requires, whichever modules it has.
const complete = (extra: Record<string, string> = {}) => {
  const env: Record<string, string> = { ...extra };
  for (const { key } of requiredVariables(extra)) env[key] ??= "https://service.example.com";
  if ("BETTER_AUTH_SECRET" in env) env.BETTER_AUTH_SECRET = "x".repeat(32);
  return env;
};

describe("production env check", () => {
  it("passes when every required variable is set", () => {
    expect(checkProductionEnv(complete())).toEqual({ missing: [], local: [], invalid: [] });
    expect(checkProductionEnv(complete({ VERCEL: "1" }))).toEqual({
      missing: [],
      local: [],
      invalid: [],
    });
  });

  it("always requires the database and the public URL", () => {
    const keys = checkProductionEnv({}).missing.map(({ key }) => key);
    expect(keys).toContain("DATABASE_URL");
    expect(keys).toContain("APP_URL");
  });

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

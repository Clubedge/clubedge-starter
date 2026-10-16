import { describe, expect, it } from "vitest";
import { directDatabaseUrl, isNeonPooledUrl, isNeonUrl } from "./urls";

const pooled = "postgresql://u:p@ep-cool-name-a1b2c3-pooler.eu-central-1.aws.neon.tech/neondb";
const direct = "postgresql://u:p@ep-cool-name-a1b2c3.eu-central-1.aws.neon.tech/neondb";

describe("directDatabaseUrl", () => {
  it("prefers DATABASE_URL_DIRECT", () => {
    expect(directDatabaseUrl({ DATABASE_URL: pooled, DATABASE_URL_DIRECT: direct })).toBe(direct);
  });

  it("falls back to DATABASE_URL when the direct URL is unset or empty", () => {
    expect(directDatabaseUrl({ DATABASE_URL: pooled })).toBe(pooled);
    expect(directDatabaseUrl({ DATABASE_URL: pooled, DATABASE_URL_DIRECT: " " })).toBe(pooled);
    expect(directDatabaseUrl({})).toBeUndefined();
  });
});

describe("Neon URLs", () => {
  it("tells pooled from direct", () => {
    expect(isNeonUrl(pooled)).toBe(true);
    expect(isNeonPooledUrl(pooled)).toBe(true);
    expect(isNeonUrl(direct)).toBe(true);
    expect(isNeonPooledUrl(direct)).toBe(false);
  });

  it("ignores other hosts and values that aren't URLs", () => {
    expect(isNeonUrl("postgresql://u:p@db-pooler.example.com/app")).toBe(false);
    expect(isNeonPooledUrl("postgresql://u:p@db-pooler.example.com/app")).toBe(false);
    expect(isNeonUrl("not a url")).toBe(false);
  });
});

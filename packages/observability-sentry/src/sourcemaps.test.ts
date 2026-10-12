import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn<(args: string[], live: boolean) => Promise<string>>(async () => "");
const createCli = vi.fn(() => ({ execute }));

const { shouldUploadSourceMaps, uploadSourceMaps } = await import("./sourcemaps.cjs");

const directories: string[] = [];
afterEach(async () => {
  execute.mockClear();
  createCli.mockClear();
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function bundle() {
  const directory = await mkdtemp(join(tmpdir(), "sourcemaps-"));
  directories.push(directory);
  await mkdir(join(directory, "chunks"), { recursive: true });
  await writeFile(join(directory, "chunks", "app.js"), "console.log(1);\n");
  await writeFile(join(directory, "chunks", "app.js.map"), "{}");
  return directory;
}

describe("uploadSourceMaps", () => {
  it("does nothing without SENTRY_AUTH_TOKEN", async () => {
    const directory = await bundle();
    expect(shouldUploadSourceMaps({})).toBe(false);
    await expect(uploadSourceMaps(directory, {}, createCli)).resolves.toBe(false);
    expect(execute).not.toHaveBeenCalled();
    expect(await readdir(join(directory, "chunks"))).toContain("app.js.map");
  });

  it("injects debug IDs, uploads the maps, then deletes them", async () => {
    const directory = await bundle();
    const env = { SENTRY_AUTH_TOKEN: "token", SENTRY_ORG: "org", SENTRY_PROJECT: "project" };
    await expect(uploadSourceMaps(directory, env, createCli)).resolves.toBe(true);
    expect(createCli).toHaveBeenCalledWith({ authToken: "token", org: "org", project: "project" });
    expect(execute.mock.calls.map(([args]) => args.slice(0, 2))).toEqual([
      ["sourcemaps", "inject"],
      ["sourcemaps", "upload"],
    ]);
    expect(await readdir(join(directory, "chunks"))).toEqual(["app.js"]);
  });

  it("asks for the Sentry project when only the token is set", async () => {
    const directory = await bundle();
    await expect(
      uploadSourceMaps(directory, { SENTRY_AUTH_TOKEN: "token" }, createCli),
    ).rejects.toThrow("set SENTRY_ORG and SENTRY_PROJECT too");
  });
});

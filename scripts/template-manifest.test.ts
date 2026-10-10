import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// create-clubedge-app reads clubedge.template.json to scaffold projects from this repository.
//
// Top-level paths describe the generated project: the selected framework's app always lands
// in `app` as `appPackage`. Each framework entry says where that framework's files live here;
// the CLI moves the app to `app` and its envExample and dockerfile to `env.example` and
// `Dockerfile`, and leaves the other frameworks out.
const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const manifest = readJson("clubedge.template.json");
const frameworks = Object.entries<Record<string, string>>(manifest.frameworks);

/** Maps a generated-project path into the given framework's app in this repository. */
const inFramework = (path: string, app: string) => path.replace(manifest.app, app);

describe("clubedge.template.json", () => {
  it("uses the schema version the CLI understands", () => {
    expect(manifest.schemaVersion).toBe(2);
    expect(manifest.packageManager).toBe("pnpm");
  });

  it("defaults to a framework it describes", () => {
    expect(Object.keys(manifest.frameworks)).toContain(manifest.defaultFramework);
    expect(manifest.frameworks[manifest.defaultFramework].app).toBe(manifest.app);
  });

  it.each(frameworks)("points at files that exist for %s", (_id, framework) => {
    for (const path of [
      framework.app,
      framework.envExample,
      framework.dockerfile,
      inFramework(manifest.siteConfig, framework.app),
    ]) {
      expect(existsSync(path), path).toBe(true);
    }
    expect(framework.name).toEqual(expect.any(String));
  });

  it.each(frameworks)("keeps the same project identity in %s", (_id, framework) => {
    expect(readJson(inFramework(manifest.siteConfig, framework.app))).toEqual(
      readJson(manifest.siteConfig),
    );
  });

  it("names the site config fields the CLI rewrites", () => {
    expect(readJson(manifest.siteConfig)).toMatchObject({
      name: expect.any(String),
      shortName: expect.any(String),
      description: expect.any(String),
      serviceId: expect.any(String),
      workspaceLabel: expect.any(String),
    });
  });

  it("uses the generated app package name for the default framework", () => {
    expect(readJson(`${manifest.app}/package.json`).name).toBe(manifest.appPackage);
  });

  it("keeps maintainer-only files out of generated projects", () => {
    // Generated projects have no manifest, so this test must not be copied into them either.
    expect(manifest.exclude).toEqual(
      expect.arrayContaining(["clubedge.template.json", "scripts/template-manifest.test.ts"]),
    );
  });

  it("matches the Docker image name used by the root scripts", () => {
    const { scripts } = readJson("package.json");
    expect(scripts["docker:build"]).toContain(`-t ${manifest.dockerImage} `);
    expect(scripts["docker:start"]).toContain(` ${manifest.dockerImage}`);
  });
});

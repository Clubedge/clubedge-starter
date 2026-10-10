import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// create-clubedge-app reads clubedge.template.json to scaffold projects from this repository.
const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const manifest = readJson("clubedge.template.json");

describe("clubedge.template.json", () => {
  it("uses the schema version the CLI understands", () => {
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.packageManager).toBe("pnpm");
  });

  it("points at files that exist", () => {
    for (const path of [manifest.app, manifest.siteConfig, manifest.env.example]) {
      expect(existsSync(path), path).toBe(true);
    }
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

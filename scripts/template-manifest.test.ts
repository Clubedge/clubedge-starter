import { execFileSync } from "node:child_process";
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
    expect(manifest.schemaVersion).toBe(3);
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

// ---- Modules (schema 3) ---------------------------------------------------------------------

type ModuleOption = {
  name: string;
  packages?: Record<string, string>;
  files?: string[];
  replace?: Record<string, string>;
  requires?: Record<string, string | string[]>;
};
type TemplateModule = { name: string; default: string; options: Record<string, ModuleOption> };

const modules = Object.entries<TemplateModule>(manifest.modules);
const options = modules.flatMap(([moduleId, module]) =>
  Object.entries(module.options).map(([optionId, option]) => ({ moduleId, optionId, option })),
);
const optionLabel = ({ moduleId, optionId }: { moduleId: string; optionId: string }) =>
  `${moduleId}=${optionId}`;

/** Tracked and untracked, non-ignored files: what create-clubedge-app copies. */
const templateFiles = execFileSync("git", ["ls-files", "-co", "--exclude-standard"], {
  encoding: "utf8",
})
  .split("\n")
  .filter((file) => file && existsSync(file));

// Same pattern as create-clubedge-app: //, #, %% (Mermaid), <!-- -->, /* */, or {/* */}.
const MARKER =
  /^\s*(?:\/\/|#|%%|<!--|\{?\/\*)\s*clubedge:(if|end)\b\s*(.*?)\s*(?:-->|\*\/\}?)?\s*$/;
// A single line kept only when its condition holds: "- Item <!-- clubedge:only auth=supabase -->".
const LINE_MARKER = /\s*(?:\/\/|#|<!--|\{?\/\*)\s*clubedge:only\s+(.+?)\s*(?:-->|\*\/\}?)?\s*$/;

describe("clubedge.template.json modules", () => {
  it("gives every module a default among its options", () => {
    for (const [id, module] of modules) {
      expect(Object.keys(module.options), id).toContain(module.default);
    }
  });

  it.each(options.map((entry) => [optionLabel(entry), entry]))(
    "%s points at packages and files that exist",
    (_label, { option }) => {
      for (const [name, directory] of Object.entries(option.packages ?? {})) {
        expect(readJson(`${directory}/package.json`).name, directory).toBe(name);
      }
      for (const path of option.files ?? []) expect(existsSync(path), path).toBe(true);
      for (const [target, variant] of Object.entries(option.replace ?? {})) {
        expect(existsSync(target), target).toBe(true);
        expect(existsSync(variant), variant).toBe(true);
      }
    },
  );

  it.each(options.map((entry) => [optionLabel(entry), entry]))(
    "%s requires only options that exist",
    (_label, { option }) => {
      for (const [moduleId, allowed] of Object.entries(option.requires ?? {})) {
        for (const value of [allowed].flat()) {
          expect(Object.keys(manifest.modules[moduleId]?.options ?? {}), moduleId).toContain(value);
        }
      }
    },
  );

  it("keeps variants in variants/ directories with alias imports only", () => {
    // Variants are copied over the file they replace, so relative imports would break.
    const variants = options.flatMap(({ option }) => Object.values(option.replace ?? {}));
    for (const variant of variants) {
      expect(variant, variant).toMatch(/\/variants\/[^/]+$/);
      expect(readFileSync(variant, "utf8"), variant).not.toMatch(/from\s+["']\.\.?\//);
    }
  });

  it("lists every file with clubedge:if blocks as conditional, and only those", () => {
    const withMarkers = templateFiles.filter((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .some((line) => MARKER.test(line) || LINE_MARKER.test(line)),
    );
    expect([...manifest.conditional].sort()).toEqual(
      withMarkers.filter((file) => !manifest.exclude.includes(file)).sort(),
    );
  });

  it.each(manifest.conditional.map((file: string) => [file]))(
    "%s has balanced blocks that name real modules and options",
    (file) => {
      const known: Record<string, string[]> = {
        framework: Object.keys(manifest.frameworks),
        ...Object.fromEntries(modules.map(([id, module]) => [id, Object.keys(module.options)])),
      };
      const checkCondition = (condition: string, where: string) => {
        if (condition.trim() === "starter-repository") return;
        for (const part of condition.split("&&")) {
          const match = /^\s*([a-z-]+)\s*!?=\s*([a-z0-9|-]+)\s*$/.exec(part);
          expect(match, `${where} condition "${part}"`).not.toBeNull();
          const [, key, values] = match!;
          for (const value of values!.split("|")) {
            expect(known[key!] ?? [], `${where} ${key}=${value}`).toContain(value);
          }
        }
      };
      let open = false;
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, index) => {
          const where = `${file}:${index + 1}`;
          const lineMarker = LINE_MARKER.exec(line);
          if (lineMarker && !MARKER.test(line)) {
            checkCondition(lineMarker[1]!, where);
            return;
          }
          const marker = MARKER.exec(line);
          if (!marker) return;
          if (marker[1] === "end") {
            expect(open, `${where} closes nothing`).toBe(true);
            open = false;
            return;
          }
          expect(open, `${where} nests a block`).toBe(false);
          open = true;
          if (marker[2] !== "starter-repository") checkCondition(marker[2]!, where);
        });
      expect(open, `${file} leaves a block open`).toBe(false);
    },
  );
});

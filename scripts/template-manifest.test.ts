import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { posix } from "node:path";
import { describe, expect, it } from "vitest";

// create-clubedge-app scaffolds projects from this repository, assembled from packs (schema 5):
//
//   clubedge.template.json            slots (where apps land), the module order, shared files
//   clubedge/modules/<id>.json        a module: options, packages, scripts, shared files
//   apps/<name>/clubedge.stack.json   a stack: its role, and its own files for each option
//
// A stack's paths are relative to its folder. The CLI moves the selected stack's app to its
// slot's path, and its envExample and dockerfile to the slot's, and leaves other stacks out.
// The checks below run on the assembled view: each option's shared and stack files together.
const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const root = readJson("clubedge.template.json");
const slot = root.slots.framework;

type StackEntry = { files?: string[]; replace?: Record<string, string> };
const stackDescriptors = readdirSync("apps", { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(`apps/${entry.name}/clubedge.stack.json`))
  .map((entry) => ({
    app: `apps/${entry.name}`,
    ...readJson(`apps/${entry.name}/clubedge.stack.json`),
  }));
const inApp = (app: string, path: string) => posix.normalize(posix.join(app, path));

const moduleDescriptors = Object.fromEntries(
  (root.modules as string[]).map((id) => [id, readJson(`clubedge/modules/${id}.json`)]),
);
for (const stack of stackDescriptors) {
  for (const [moduleId, entries] of Object.entries<Record<string, StackEntry>>(
    stack.modules ?? {},
  )) {
    for (const [key, entry] of Object.entries(entries)) {
      for (const optionId of key.split("|")) {
        const option = moduleDescriptors[moduleId].options[optionId];
        option.files = [
          ...(option.files ?? []),
          ...(entry.files ?? []).map((path) => inApp(stack.app, path)),
        ];
        for (const [target, variant] of Object.entries(entry.replace ?? {})) {
          option.replace = {
            ...option.replace,
            [inApp(stack.app, target)]: inApp(stack.app, variant),
          };
        }
      }
    }
  }
}
const manifest = {
  ...root,
  app: slot.path,
  appPackage: slot.package,
  frameworks: Object.fromEntries(
    stackDescriptors.map((stack) => [
      stack.id,
      {
        name: stack.name,
        app: stack.app,
        envExample: inApp(stack.app, stack.envExample),
        // A mobile shell runs on devices, not from an image.
        ...(stack.dockerfile ? { dockerfile: inApp(stack.app, stack.dockerfile) } : {}),
      },
    ]),
  ),
  modules: moduleDescriptors,
  conditional: [
    ...root.conditional,
    ...stackDescriptors.flatMap((stack) =>
      (stack.conditional ?? []).map((path: string) => inApp(stack.app, path)),
    ),
  ],
  // The CLI leaves the descriptors out of generated projects.
  exclude: [
    ...root.exclude,
    "clubedge/modules",
    ...stackDescriptors.map((stack) => `${stack.app}/clubedge.stack.json`),
  ],
};
const frameworks = Object.entries<{
  name: string;
  app: string;
  envExample: string;
  dockerfile?: string;
}>(manifest.frameworks);

/** Maps a generated-project path into the given framework's app in this repository. */
const inFramework = (path: string, app: string) => path.replace(manifest.app, app);

/**
 * Stacks that name the project in a site config of their own: the framework slot's, and those of
 * slots with a siteConfig. A mobile shell reads its web app's.
 */
const withSiteConfig = new Set(
  stackDescriptors
    .filter((stack) =>
      Object.entries<{ roles: string[]; siteConfig?: string }>(root.slots).some(
        ([id, s]) => s.roles.includes(stack.role) && (id === "framework" || s.siteConfig),
      ),
    )
    .map((stack) => stack.id),
);

describe("stack packs", () => {
  it.each(stackDescriptors.map((stack) => [stack.app, stack]))(
    "%s fills a slot and implements every option of the app modules",
    (_app, stack) => {
      expect(
        Object.values<{ roles: string[] }>(root.slots).some((s) => s.roles.includes(stack.role)),
      ).toBe(true);
      for (const [id, module] of Object.entries<{ scope?: string; options: object }>(
        moduleDescriptors,
      )) {
        if (module.scope === "project") continue;
        const implemented = [
          ...new Set(Object.keys(stack.modules?.[id] ?? {}).flatMap((key) => key.split("|"))),
        ];
        // Full-stack apps implement every option; frontends and APIs say what they implement.
        if (stack.role === "fullstack")
          expect(implemented.sort(), `${stack.id}: ${id}`).toEqual(
            Object.keys(module.options).sort(),
          );
        for (const option of implemented)
          expect(Object.keys(module.options), `${stack.id}: ${id}`).toContain(option);
      }
    },
  );

  it("lets every frontend work with every API", () => {
    // The CLI offers the options that every selected stack listing a module implements. A
    // frontend lists only the modules it takes part in, and offers "none" with them, so it still
    // pairs with an API that has none of that module yet.
    const implemented = (stack: (typeof stackDescriptors)[number], id: string) =>
      stack.modules?.[id]
        ? Object.keys(stack.modules[id]).flatMap((key) => key.split("|"))
        : undefined;
    const withRole = (role: string) => stackDescriptors.filter((stack) => stack.role === role);
    for (const [id, module] of Object.entries<{ scope?: string; options: object }>(
      moduleDescriptors,
    )) {
      if (module.scope === "project") continue;
      for (const frontend of withRole("frontend")) {
        const offered = implemented(frontend, id);
        if (offered && "none" in module.options) {
          expect(offered, `${frontend.id}: ${id}`).toContain("none");
        }
        for (const api of withRole("api")) {
          const choices = [offered, implemented(api, id)].filter((list) => list !== undefined);
          expect(choices, `${frontend.id} with ${api.id}: neither implements ${id}`).not.toEqual(
            [],
          );
          const common = Object.keys(module.options).filter((option) =>
            choices.every((list) => list.includes(option)),
          );
          expect(common, `${frontend.id} with ${api.id}: ${id}`).not.toEqual([]);
        }
      }
    }
  });

  it("lets every mobile app work with every API", () => {
    // A mobile app lists the options it implements, such as the sign-in providers it has
    // screens for; with each API, one of them must remain, and "none" where the module has it.
    const implemented = (stack: (typeof stackDescriptors)[number], id: string) =>
      stack.modules?.[id]
        ? Object.keys(stack.modules[id]).flatMap((key) => key.split("|"))
        : undefined;
    const withRole = (role: string) => stackDescriptors.filter((stack) => stack.role === role);
    for (const [id, module] of Object.entries<{ scope?: string; options: object }>(
      moduleDescriptors,
    )) {
      if (module.scope === "project") continue;
      for (const mobile of withRole("mobile")) {
        const offered = implemented(mobile, id);
        if (!offered) continue;
        if ("none" in module.options) expect(offered, `${mobile.id}: ${id}`).toContain("none");
        for (const api of withRole("api")) {
          const theirs = implemented(api, id) ?? Object.keys(module.options);
          const common = offered.filter((option) => theirs.includes(option));
          expect(common, `${mobile.id} with ${api.id}: ${id}`).not.toEqual([]);
        }
      }
    }
  });

  it("gives every stack its own id", () => {
    const ids = stackDescriptors.map((stack) => stack.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(slot.default);
  });

  it("gives every advisory pnpm audit skips to the stack whose dependencies need it", () => {
    // The CLI removes a stack's auditIgnores from projects without the stack, so each advisory
    // package.json skips belongs to a stack, and projects without it audit that advisory again.
    const skipped: string[] = readJson("package.json").pnpm?.auditConfig?.ignoreGhsas ?? [];
    const owned = stackDescriptors.flatMap<string>((stack) => stack.auditIgnores ?? []);
    expect([...skipped].sort()).toEqual([...new Set(owned)].sort());
  });
});

describe("clubedge.template.json", () => {
  it("uses the schema version the CLI understands", () => {
    expect(manifest.schemaVersion).toBe(6);
    expect(manifest.packageManager).toBe("pnpm");
  });

  it("defaults to a framework it describes", () => {
    expect(Object.keys(manifest.frameworks)).toContain(slot.default);
    expect(manifest.frameworks[slot.default].app).toBe(manifest.app);
  });

  it.each(frameworks)("points at files that exist for %s", (id, framework) => {
    const paths = [framework.app, framework.envExample, framework.dockerfile];
    if (withSiteConfig.has(id)) paths.push(inFramework(manifest.siteConfig, framework.app));
    for (const path of paths.filter((path) => path !== undefined)) {
      expect(existsSync(path), path).toBe(true);
    }
    expect(framework.name).toEqual(expect.any(String));
  });

  it.each(frameworks.filter(([id]) => withSiteConfig.has(id)))(
    "keeps the same project identity in %s",
    (_id, framework) => {
      expect(readJson(inFramework(manifest.siteConfig, framework.app))).toEqual(
        readJson(manifest.siteConfig),
      );
    },
  );

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

  it("titles every project's README", () => {
    // The CLI names the project in the README's first heading and records its provenance under
    // it, so the hidden title block must be kept for every framework, and for none.
    const title = /<!-- clubedge:if framework=([a-z0-9|-]+)\r?\n# /.exec(
      readFileSync("README.md", "utf8"),
    );
    const frameworkStacks = stackDescriptors
      .filter((stack) => slot.roles.includes(stack.role))
      .map((stack) => stack.id);
    expect(title?.[1]?.split("|").sort()).toEqual(
      [...frameworkStacks, ...(slot.optional ? ["none"] : [])].sort(),
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

  it("never removes a core script", () => {
    // The CLI removes scripts that only left-out options set. When one option changes a core
    // script (local infrastructure adds its database to dev), every option must set it.
    const coreScripts = ["dev", "build", "start", "lint", "typecheck", "test", "db:migrate"];
    for (const [id, module] of modules) {
      const options = Object.entries<{ scripts?: Record<string, string> }>(module.options);
      for (const script of coreScripts) {
        if (!options.some(([, option]) => option.scripts?.[script])) continue;
        for (const [optionId, option] of options) {
          expect(option.scripts?.[script], `${id}=${optionId} must set ${script}`).toBeDefined();
        }
      }
    }
  });

  it("matches the root scripts to each module's default option", () => {
    const rootScripts = readJson("package.json").scripts;
    for (const [id, module] of modules) {
      const scripts = module.options[module.default].scripts ?? {};
      for (const [name, command] of Object.entries(scripts)) {
        expect(rootScripts[name], `${id}: ${name}`).toBe(command);
      }
    }
  });

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
      // Each slot's stacks (and "none" for slots that can be left empty: those without a
      // default, and optional ones), then each module's options.
      const slots = Object.entries<{ roles: string[]; default?: string; optional?: boolean }>(
        root.slots,
      );
      const known: Record<string, string[]> = {
        ...Object.fromEntries(
          slots.map(([id, slot]) => [
            id,
            [
              ...stackDescriptors
                .filter((stack) => slot.roles.includes(stack.role))
                .map((stack) => stack.id),
              ...(slot.default && !slot.optional ? [] : ["none"]),
            ],
          ]),
        ),
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

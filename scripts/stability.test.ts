import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// STABILITY.md promises a support level for every module option and stack. The level lives in
// the option's descriptor, where the CLI, the MCP server, and the builder read it; these checks
// keep every descriptor graded and the page's table in step with them.
const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const root = readJson("clubedge.template.json");

const levels = ["stable", "beta", "experimental", "deprecated"] as const;
type Level = (typeof levels)[number];
type Graded = {
  status?: Level;
  note?: string;
  since?: string;
  replacement?: string;
  offered?: boolean;
};

// Each graded part, as "<part>/<option>": the module options other than none, and the stacks.
const graded = new Map<
  string,
  { descriptor: Graded; file: string; siblings: Record<string, Graded> }
>();
for (const moduleId of root.modules as string[]) {
  const file = `clubedge/modules/${moduleId}.json`;
  const options: Record<string, Graded> = readJson(file).options;
  for (const [optionId, descriptor] of Object.entries(options)) {
    if (optionId === "none") continue;
    graded.set(`${moduleId}/${optionId}`, { descriptor, file, siblings: options });
  }
}
for (const entry of readdirSync("apps", { withFileTypes: true })) {
  const file = `apps/${entry.name}/clubedge.stack.json`;
  if (!entry.isDirectory() || !existsSync(file)) continue;
  const stack = readJson(file);
  graded.set(`stack/${stack.id}`, { descriptor: stack, file, siblings: {} });
}

describe("support levels", () => {
  it("grade every option and stack", () => {
    const ungraded = [...graded].filter(
      ([, { descriptor }]) => !levels.includes(descriptor.status!),
    );
    expect(ungraded.map(([id, { file }]) => `${id} (${file})`)).toEqual([]);
  });

  it("say what is missing below stable", () => {
    const silent = [...graded].filter(
      ([, { descriptor }]) =>
        descriptor.status !== "stable" &&
        !(typeof descriptor.note === "string" && descriptor.note.trim()),
    );
    expect(silent.map(([id]) => id)).toEqual([]);
  });

  it("give a deprecated option its release and a replacement that is not deprecated", () => {
    for (const [id, { descriptor, siblings }] of graded) {
      if (descriptor.status !== "deprecated") {
        expect({
          id,
          since: descriptor.since,
          replacement: descriptor.replacement,
          offered: descriptor.offered,
        }).toEqual({
          id,
          since: undefined,
          replacement: undefined,
          offered: undefined,
        });
        continue;
      }
      expect(descriptor.since, id).toMatch(/^v\d+\.\d+\.\d+$/);
      if (id.startsWith("stack/")) continue;
      const replacement = siblings[descriptor.replacement ?? ""];
      expect(replacement, `${id} names its replacement`).toBeDefined();
      expect(descriptor.replacement, id).not.toBe(id.split("/")[1]);
      expect(replacement?.status, `${id}'s replacement`).not.toBe("deprecated");
      if (descriptor.offered !== undefined) expect(typeof descriptor.offered, id).toBe("boolean");
    }
  });

  it("record each removed option's release and a replacement the module still offers", () => {
    for (const moduleId of root.modules as string[]) {
      const descriptor = readJson(`clubedge/modules/${moduleId}.json`);
      for (const [optionId, removed] of Object.entries<{ since?: string; replacement?: string }>(
        descriptor.removed ?? {},
      )) {
        const id = `${moduleId}/${optionId}`;
        expect(descriptor.options[optionId], `${id} is no longer an option`).toBeUndefined();
        expect(removed.since, id).toMatch(/^v\d+\.\d+\.\d+$/);
        expect(
          descriptor.options[removed.replacement ?? ""],
          `${id} names its replacement`,
        ).toBeDefined();
      }
    }
  });

  it("match the table in STABILITY.md", () => {
    const rows = new Map<string, string>();
    for (const line of readFileSync("STABILITY.md", "utf8").split("\n")) {
      const match =
        /^\|\s*`([a-z-]+)`\s*\|\s*`([a-z0-9-]+)`\s*\|\s*(Stable|Beta|Experimental|Deprecated)\s*\|/.exec(
          line,
        );
      if (!match) continue;
      const id = `${match[1]}/${match[2]}`;
      expect(rows.has(id), `${id} is listed once`).toBe(false);
      rows.set(id, match[3]!.toLowerCase());
    }
    const descriptors = Object.fromEntries(
      [...graded].map(([id, { descriptor }]) => [id, descriptor.status]),
    );
    expect(Object.fromEntries(rows)).toEqual(descriptors);
  });
});

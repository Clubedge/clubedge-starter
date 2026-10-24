import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import openapiTS, { astToString } from "openapi-typescript";
import { capabilityOperations, moduleOperations } from "./conformance";

describe("the generated client types", () => {
  it("match openapi.yaml (run `pnpm --filter @clubedge/contract generate`)", async () => {
    const spec = new URL("../openapi.yaml", import.meta.url);
    const generated = astToString(await openapiTS(spec));
    const committed = readFileSync(fileURLToPath(new URL("./schema.ts", import.meta.url)), "utf8");
    // Prettier formats the committed file; compare the code, not its layout (such as the
    // leading | it gives a union that spans lines).
    const code = (text: string) =>
      text
        .replace(/\/\*\*[\s\S]*?\*\//g, "")
        .replace(/[\s;,]+/g, "")
        .replace(/([:=])\|/g, "$1");
    expect(code(committed)).toBe(code(generated));
  });
});

/** Each operation's x-clubedge-module and x-clubedge-capability tags in openapi.yaml. */
function taggedOperations() {
  // openapi.yaml is formatted by Prettier: paths at two spaces, methods at four, and each
  // operation's fields at six.
  const operations: Record<string, { module?: string; capability?: string }> = {};
  let path = "";
  let method = "";
  for (const line of readFileSync(new URL("../openapi.yaml", import.meta.url), "utf8").split(
    "\n",
  )) {
    path = /^ {2}(\/\S+):$/.exec(line)?.[1] ?? path;
    method = /^ {4}(get|post|put|delete):$/.exec(line)?.[1]?.toUpperCase() ?? method;
    const tag = /^ {6}x-clubedge-(module|capability): (\S+)$/.exec(line);
    if (tag) (operations[`${method} ${path}`] ??= {})[tag[1] as "module" | "capability"] = tag[2];
  }
  return Object.entries(operations);
}

const sorted = (entries: Record<string, string[]>) =>
  Object.fromEntries(Object.entries(entries).map(([key, list]) => [key, [...list].sort()]));

const listed = (operations: Array<{ method: string; path: string }>) =>
  operations.map(({ method, path }) => `${method} ${path}`);

describe("module operations", () => {
  it("match the operations openapi.yaml tags with x-clubedge-module alone", () => {
    const tagged: Record<string, string[]> = {};
    for (const [operation, { module, capability }] of taggedOperations()) {
      if (module && !capability) (tagged[module] ??= []).push(operation);
    }
    const modules = Object.fromEntries(
      Object.entries(moduleOperations).map(([module, operations]) => [module, listed(operations)]),
    );
    expect(sorted(tagged)).toEqual(sorted(modules));
  });

  it("match the operations openapi.yaml tags with x-clubedge-capability, in their module", () => {
    const tagged: Record<string, string[]> = {};
    for (const [operation, { module, capability }] of taggedOperations()) {
      if (capability) (tagged[capability] ??= []).push(`${module} ${operation}`);
    }
    const capabilities = Object.fromEntries(
      Object.entries(capabilityOperations).map(([capability, { module, operations }]) => [
        capability,
        listed(operations).map((operation) => `${module} ${operation}`),
      ]),
    );
    expect(sorted(tagged)).toEqual(sorted(capabilities));
  });
});

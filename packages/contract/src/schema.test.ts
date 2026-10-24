import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import openapiTS, { astToString } from "openapi-typescript";
import { moduleOperations } from "./conformance";

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

describe("module operations", () => {
  it("match the operations openapi.yaml tags with x-clubedge-module", () => {
    // openapi.yaml is formatted by Prettier: paths at two spaces, methods at four, and each
    // operation's fields at six.
    const tagged: Record<string, string[]> = {};
    let path = "";
    let method = "";
    for (const line of readFileSync(new URL("../openapi.yaml", import.meta.url), "utf8").split(
      "\n",
    )) {
      path = /^ {2}(\/\S+):$/.exec(line)?.[1] ?? path;
      method = /^ {4}(get|post|put|delete):$/.exec(line)?.[1]?.toUpperCase() ?? method;
      const module = /^ {6}x-clubedge-module: (\S+)$/.exec(line)?.[1];
      if (module) (tagged[module] ??= []).push(`${method} ${path}`);
    }
    const listed = Object.fromEntries(
      Object.entries(moduleOperations).map(([module, operations]) => [
        module,
        operations.map(({ method, path }) => `${method} ${path}`),
      ]),
    );
    const sorted = (entries: Record<string, string[]>) =>
      Object.fromEntries(Object.entries(entries).map(([key, list]) => [key, [...list].sort()]));
    expect(sorted(tagged)).toEqual(sorted(listed));
  });
});

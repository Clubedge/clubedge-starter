import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import openapiTS, { astToString } from "openapi-typescript";

describe("the generated client types", () => {
  it("match openapi.yaml (run `pnpm --filter @clubedge/contract generate`)", async () => {
    const spec = new URL("../openapi.yaml", import.meta.url);
    const generated = astToString(await openapiTS(spec));
    const committed = readFileSync(fileURLToPath(new URL("./schema.ts", import.meta.url)), "utf8");
    // Prettier formats the committed file; compare the code, not its layout.
    const code = (text: string) => text.replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/[\s;,]+/g, "");
    expect(code(committed)).toBe(code(generated));
  });
});

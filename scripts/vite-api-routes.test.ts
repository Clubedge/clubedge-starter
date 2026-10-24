import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The Vite frontend's Node server (apps/vite/server.mjs) forwards only the API operations it
// lists, so an operation added to packages/contract/openapi.yaml must be listed there too, or
// production answers it 404 while the dev server's proxy forwards it. Generated projects list
// only their modules' operations (clubedge:only lines); this repository lists them all.
const operations = () => {
  const found: string[] = [];
  let path = "";
  // openapi.yaml is formatted by Prettier: paths at two spaces, their methods at four.
  for (const line of readFileSync("packages/contract/openapi.yaml", "utf8").split("\n")) {
    path = /^ {2}(\/\S+):$/.exec(line)?.[1] ?? path;
    const method = /^ {4}(get|post|put|delete|patch):$/.exec(line)?.[1];
    if (method) found.push(`${method.toUpperCase()} ${path}`);
  }
  return found;
};

const forwarded = () =>
  [
    ...readFileSync("apps/vite/server.mjs", "utf8").matchAll(
      /\["([A-Z]+ \/api\/\S*)", "([^"]+)"\]/g,
    ),
  ].map(([, route, upstream]) => ({ route: route!, upstream: upstream! }));

describe("apps/vite/server.mjs", () => {
  it("forwards every operation of the contract, and nothing else", () => {
    const routes = forwarded().map(({ route }) => route);
    expect(routes.sort()).toEqual(operations().sort());
  });

  it("forwards each one to the same path on the API", () => {
    for (const { route, upstream } of forwarded())
      expect(route).toBe(`${route.split(" ")[0]} ${upstream}`);
  });
});

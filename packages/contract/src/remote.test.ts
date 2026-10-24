// The conformance suite against a running API in any language. CI starts the API, then runs:
//   API_URL=http://127.0.0.1:3001 pnpm exec vitest run packages/contract/src/remote.test.ts
import { existsSync, readFileSync } from "node:fs";
import { describeApiConformance } from "./conformance";

const baseUrl = process.env.API_URL;

/**
 * The project's modules: API_MODULES (JSON, such as {"payments":"stripe"}), else the selection
 * a generated project records in its package.json. Without either, every module is "none".
 */
function selectedModules(): Record<string, string> {
  if (process.env.API_MODULES) return JSON.parse(process.env.API_MODULES);
  if (!existsSync("package.json")) return {};
  const { clubedge } = JSON.parse(readFileSync("package.json", "utf8"));
  return clubedge?.modules ?? {};
}

/**
 * The optional parts of the contract the API implements (capabilityOperations in conformance.ts)
 * from API_CAPABILITIES, a comma-separated list such as "account"; none without it. An API sets
 * it once it implements them; the Hono API's own test passes them directly.
 */
const capabilities = (process.env.API_CAPABILITIES ?? "")
  .split(",")
  .map((capability) => capability.trim())
  .filter(Boolean);

describeApiConformance(
  baseUrl ?? "API_URL",
  () => ({ request: (path, init) => fetch(new URL(path, baseUrl), init) }),
  {
    skip: !baseUrl,
    ...(process.env.API_SERVICE ? { service: process.env.API_SERVICE } : {}),
    modules: selectedModules(),
    capabilities,
  },
);

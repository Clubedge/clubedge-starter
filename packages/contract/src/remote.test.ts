// The conformance suite against a running API in any language. CI starts the API, then runs:
//   API_URL=http://127.0.0.1:3001 pnpm exec vitest run packages/contract/src/remote.test.ts
import { describeApiConformance } from "./conformance";

const baseUrl = process.env.API_URL;

describeApiConformance(
  baseUrl ?? "API_URL",
  () => ({ request: (path, init) => fetch(new URL(path, baseUrl), init) }),
  {
    skip: !baseUrl,
    ...(process.env.API_SERVICE ? { service: process.env.API_SERVICE } : {}),
  },
);

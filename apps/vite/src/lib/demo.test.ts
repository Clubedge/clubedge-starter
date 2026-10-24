import { expectTypeOf, it } from "vitest";
import { api as demoApi } from "@clubedge/mobile/demo/api";
import { authClient as demoAuthClient, getAccessToken } from "@clubedge/mobile/demo/auth";
import type { api } from "@/lib/api";
import type { AuthClient } from "@/lib/auth-client";

// The mobile app's demo build (vite.config.ts) takes these modules for @/lib/auth and @/lib/api,
// so they must offer what the app imports from those; `pnpm typecheck` checks it. Only the
// Starter repository keeps this file (clubedge.template.json's exclude).
it("offers what the app imports from @/lib/auth and @/lib/api", () => {
  expectTypeOf(demoAuthClient).toExtend<AuthClient>();
  expectTypeOf(getAccessToken).toExtend<() => Promise<string | undefined>>();
  expectTypeOf(demoApi).toEqualTypeOf<typeof api>();
});

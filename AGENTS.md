# Agent guide

## Architecture rules

- Every package except `packages/ui` is framework-agnostic. Never import `next`, `react`, `server-only`, `@tanstack/*`, or app code (`@/…`) there. Accept configuration, clients, and cookies as function arguments. <!-- clubedge:only framework!=none -->
- Every package is framework-agnostic. Never import `next`, `react`, `server-only`, `@tanstack/*`, or app code (`@/…`) there. Accept configuration, clients, and cookies as function arguments. <!-- clubedge:only framework=none -->
- Interfaces live in `packages/{auth,storage,cache}`; each provider is its own package holding that provider's SDK, so replacing a provider means swapping one package. Keep provider SDKs out of the interface packages.
- Each provider module in `src/server/` validates its own environment variables with `parseEnv`; `src/env/server.ts` holds only the core variables. <!-- clubedge:only framework!=none -->
- Each provider module in the API's `src/server/` validates its own environment variables with `parseEnv`; `src/env.ts` holds only the core variables. <!-- clubedge:only framework=none && api=hono -->
- Each provider module in the API's `src/clubedge_api/`, such as `email.py` or `storage.py`, reads its own environment variables; `settings.py` reads the ones the whole API shares, such as `DATABASE_URL`. <!-- clubedge:only framework=none && api=fastapi -->
- `packages/core` depends on no other workspace package.
- The app's `src/server/` is its composition root: the only place that reads environment variables, bridges the framework's cookies to `CookieStore`, and picks providers. Routes, server actions, server functions, and components import from `@/server/*`, never from a provider SDK such as `@supabase/*`, `@aws-sdk/*`, `redis`, or `postgres`. <!-- clubedge:only framework!=none -->
- The API's `src/server/` is its composition root: the only place that reads environment variables and picks providers. Routes in `src/app.ts` and `src/routes/` receive what they need from it, never from a provider SDK such as `@supabase/*`, `@aws-sdk/*`, `redis`, or `postgres`. <!-- clubedge:only framework=none && api=hono -->
- The API's `src/clubedge_api/server.py` is its composition root: the only place that picks providers. Routes in `src/clubedge_api/routes/` receive what they need from it, never from a provider SDK. <!-- clubedge:only framework=none && api=fastapi -->
- `apps/web` (Next.js) and `apps/start` (TanStack Start) are the same product. Make user-facing changes in both, keep their markup and redirects identical, and run the shared browser suite against each (`E2E_APP=start pnpm test:e2e`). <!-- clubedge:only starter-repository -->
- Files listed under `conditional` in `clubedge.template.json` contain `clubedge:if` blocks and `clubedge:only` lines that create-clubedge-app keeps or drops per framework and module. Keep every block present for the default selection, and use a file under `variants/` when two options need different code. <!-- clubedge:only starter-repository -->
- `apps/shell` builds the web app as a mobile app, in Vite's `app` mode. Keep app-only code under `import.meta.env.MODE === "app"`, and load `@clubedge/mobile` there with a dynamic `import()`, so the website's build has no Capacitor. Links that leave the app, such as those in emails, use the website's origin (`publicOrigin` from `@/lib/public-origin`). `packages/mobile` also holds the app's own screens, so like `packages/ui` it may use React; its demo fakes stand in for `@/lib/auth` and `@/lib/api` in a `--demo` build, so keep them offering what the app imports. <!-- clubedge:only shell!=none -->
- `apps/mobile` is a React Native app (Expo): no DOM, no `@clubedge/ui`, no Tailwind. Its screens are routes under `src/app` (Expo Router), take their colors from `@/lib/theme`, and call the API only through `@/lib/api`; the sign-in provider's SDK stays in `src/variants/auth.*`. Expo generates `android/` and `ios/` from `app.config.ts`, so change the config, never those folders. <!-- clubedge:only mobile!=none -->
- Expected failures (bad credentials, invalid codes) are returned as `Result` values from `@clubedge/core`; exceptions are for unexpected errors.
- Project identity (name, description, links) lives in `src/config/site.json`, so do not hard-code the project name elsewhere.
- `pnpm lint` enforces these boundaries. Run `pnpm lint`, `pnpm typecheck`, and `pnpm test` before finishing a change.

<!-- clubedge:if framework=next -->

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- clubedge:end -->

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->

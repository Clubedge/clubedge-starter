# Agent guide

## Architecture rules

- `packages/{core,auth,cache,db,storage}` are framework-agnostic. Never import `next`, `react`, `server-only`, `@tanstack/*`, or app code (`@/…`) there. Accept configuration, clients, and cookies as function arguments.
- `packages/core` depends on no other workspace package.
- Each app's `src/server/` is its composition root: the only place that reads environment variables, bridges the framework's cookies to `CookieStore`, and picks providers. Routes, server actions, server functions, and components import from `@/server/*`, never from `@supabase/*`, `@aws-sdk/*`, `redis`, or `postgres`.
- `apps/web` (Next.js) and `apps/start` (TanStack Start) are the same product. Make user-facing changes in both, keep their markup and redirects identical, and run the shared browser suite against each (`E2E_APP=start pnpm test:e2e`).
- Expected failures (bad credentials, invalid codes) are returned as `Result` values from `@clubedge/core`; exceptions are for unexpected errors.
- Project identity (name, description, links) lives in each app's `src/config/site.json` (keep them identical); `create-clubedge-app` rewrites that file, so do not hard-code the project name elsewhere.
- `pnpm lint` enforces these boundaries. Run `pnpm lint`, `pnpm typecheck`, and `pnpm test` before finishing a change.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->

# Contributing

Thanks for helping improve Clubedge Starter. Contributions of code, documentation, bug reports, and focused feature proposals are welcome.

## Before you start

- Check existing issues and pull requests for related work.
- For a large or user-visible change, open an issue first so we can agree on the scope.
- For security concerns, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.
- Keep pull requests focused. Explain the problem, the change, and any setup or migration impact.

## Development setup

Follow [SETUP.md](SETUP.md) to install dependencies and configure local services. Most changes can be checked with:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
pnpm build
```

Run `pnpm test:e2e` for changes that affect browser behavior. It requires a locally installed Playwright browser. CI runs the full configured verification workflow for pull requests.

## Contribution workflow

1. Fork the repository and create a focused branch from `main`.
2. Make the change and add or update coverage and documentation where appropriate.
3. Run the checks relevant to the change and review `git diff` for secrets or generated output.
4. Open a pull request against `main`, describe the user impact, and link the related issue when there is one.
5. Respond to review feedback; maintainers will use the pull request checks and discussion to decide when the change is ready to merge.

## Project conventions

- Keep application code in `apps/web` (Next.js) and `apps/start` (TanStack Start), reusable shadcn/ui code in `packages/ui`, and framework-agnostic interfaces in `packages/{core,auth,db,storage,cache}` with each provider in its own package (`auth-supabase`, `storage-s3`, `storage-supabase`, `cache-redis`). A user-facing change belongs in both apps.
- Reach providers through each app's `src/server` rather than scattering provider SDK calls through routes and components. `pnpm lint` enforces these boundaries.
- Keep server secrets out of client code and out of committed files. Update `.env.example` when adding configuration, using placeholders only.
- For database changes, update the Drizzle schema and generate, review, and commit the migration. Do not maintain a second migration history for the same application tables.
- For shared UI changes, preserve compatibility between both `components.json` files and use the established package exports.
- Update docs when commands, configuration, or behavior change.
- `clubedge.template.json` tells `create-clubedge-app` how to scaffold this repository. Keep it in step when moving the app, the site config, the environment example, or the Docker image name; `pnpm test` checks it.
- Follow the existing formatting and TypeScript conventions. Prefer a small dependency footprint and explain new runtime dependencies in the pull request.

## Changing a shared interface

A change to a provider-neutral interface (`AuthProvider`, `StorageProvider`, `Cache`, `EmailProvider`, `PaymentProvider`, `JobQueue`, …) reaches every adapter and every generated project. Work through it in this order:

1. Name every implementation: the interface package's own reference (in-memory queue, memory cache, file-system storage) and each `packages/<module>-<provider>` adapter.
2. Decide whether the change is breaking. TypeScript reports missing members; a changed behavior belongs in the module's conformance suite, which is its executable definition. Breaking public behavior is announced in the release notes, since packages version with the Starter release.
3. Update the contract and its conformance suite in the interface package first, so the intended behavior is written down before any adapter moves.
4. Update every adapter. `pnpm typecheck` fails until each one implements the change, and `pnpm test` holds each to the same behavior through the shared suite.
5. Let CI prove the rest: the nightly workflow runs the suites that need real services (Supabase, S3-compatible servers, SMTP, stripe-mock), and `starter.yml` builds representative generated projects.
6. Update documentation and `.env.example` when configuration or behavior changed.

A new provider joins by implementing the interface and passing the existing conformance suite through a small test harness — search for `describeAuth`, `describeStorage`, `describeCache`, `describeRateLimiter`, `describeEmail`, and `describePaymentProvider` to see each pattern.

## What the checks are for

The architecture pays for itself only while these stay true, so CI watches them directly:

- **Contract-test pass rate** — `pnpm test` on pull requests (offline suites) and the nightly workflow (real services). A red suite names the provider and the behavior that drifted.
- **Generated-build success rate** — the `generated-project` and `deploy-config` jobs in `starter.yml`, which scaffold, install, build, and smoke-test the combinations users receive.
- **Configuration coverage** — the matrices in `starter.yml`; a new supported combination means a new matrix entry, not a promise.
- **Regression rate** — changes to shared packages are reviewed against the suites above; a fix that only moves the failure between providers does not count as fixed.
- **Dependency health** — `pnpm audit --audit-level high` in CI and Dependabot updates.

## Pull request checklist

- [ ] The change addresses an issue or clearly explains its motivation.
- [ ] Documentation and `.env.example` are updated when needed.
- [ ] Database migrations are included and reviewed when schema changes.
- [ ] Relevant lint, typecheck, unit, formatting, and build checks pass locally.
- [ ] No credentials, generated build output, or unrelated changes are included.

By submitting a contribution for inclusion, you agree that it will be distributed under the repository's [Apache License, Version 2.0](LICENSE), consistent with section 5 of that license. No separate contributor license agreement is currently required.

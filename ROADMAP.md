# Roadmap

This roadmap describes the Starter work planned after v0.8.0. The command-line side of the same phases lives in the [create-clubedge-app roadmap](https://github.com/Clubedge/create-clubedge-app/blob/main/ROADMAP.md). Phases are delivered in order, and each one ends with a Starter release and a CLI release pinned to it.

Every phase follows the rules the existing modules already follow:

- A module is optional, described in `clubedge.template.json`, and removed completely when it is left out: its packages, provider SDKs, environment variables, documentation, and lockfile entries.
- Provider SDKs live in their own package behind an interface in a provider-neutral package, and each app's `src/server/` is the composition root.
- Both frameworks get the same behavior and the same browser tests.
- Local development works with `--infra docker`, `--infra supabase`, and `--infra local` where the provider allows it, and `pnpm check:services` covers the new service.
- `starter.yml` generates projects for the new combinations and runs their full pipeline, including a real end-to-end flow against local services.

## Done

| Phase   | Release   | What it delivered                                                                      |
| ------- | --------- | -------------------------------------------------------------------------------------- |
| 4       | v0.5.0    | Optional modules (template schema 3), Better Auth, one package per provider            |
| 5.1     | v0.6.0    | Local infrastructure: Docker Compose, the Supabase CLI stack, `pnpm check:services`    |
| 5.2     | v0.7.0    | No-Docker local mode: PGlite served over the PostgreSQL protocol, local folder storage |
| 5.3–5.4 | CLI 0.8.0 | `add`, `remove`, and `upgrade` with a three-way merge (CLI only)                       |
| 6       | v0.8.0    | `pnpm clubedge` script, Windows unit tests                                             |
| 7       | v0.9.0    | Email (SMTP, Resend), password reset, optional email verification, local inboxes       |
| 8       | v0.10.0   | Deployment: Docker, Fly.io, Railway, Render, Vercel, Netlify, and a built-in migrator  |
| 9       | v0.11.0   | Payments: Stripe Checkout, the customer portal, webhook-synced subscriptions           |

## Phase 10.1: Background jobs

**Module:** `jobs`, with the options `pg-boss` (jobs stored in the project's PostgreSQL, no new service) and `none` (default).

**Scope:**

- `packages/jobs` (the `JobQueue` interface, `defineJob`, and an in-memory queue for tests) and `packages/jobs-pg-boss`.
- The worker runs inside the app server, so no deploy target needs a second process: `instrumentation.ts` starts it in Next.js and a Nitro plugin in TanStack Start, in `pnpm dev` and in production.
- Retries with backoff, timeouts, and cron schedules from each job's definition.
- Serverless hosts (Vercel, Netlify) run no worker; a scheduler calls `/api/jobs/run` with `CRON_SECRET` to run the jobs that are due.
- A dashboard card that queues a sample job and lists its recent runs.

**Tests:** unit tests run pg-boss against PGlite (on demand, in a worker, retries, throttling); a browser test queues the sample job and waits for the worker, against Docker, the Supabase stack, and the no-Docker PGlite server.

**Later:** sending auth emails through the queue when both modules are selected.

## Phase 10.2: Observability

**Module:** `observability`, with the options `otel` (OpenTelemetry over OTLP/HTTP to any collector), `sentry`, and `none` (default).

**Scope:**

- `@clubedge/core` gets dependency-free hooks: `reportError`, `traced`, and `withSpans`, which default to the console. Packages and app code call them, so nothing outside the provider imports a vendor SDK, and leaving the module out removes every SDK.
- `packages/observability` (the `ObservabilityProvider` interface and an in-memory provider for tests), `packages/observability-otel`, and `packages/observability-sentry`.
- The provider starts from the same startup hooks as the jobs worker: `instrumentation.ts` (with `onRequestError`) in Next.js, and a Nitro plugin plus request and server-function middleware in TanStack Start.
- Each request is traced, as are calls through the email, storage, and payments composition roots; Next.js and pg-boss spans join the same traces. Handled and unhandled server errors are reported once, with the request's method and path.
- Nothing is sent until `OTEL_EXPORTER_OTLP_ENDPOINT` or `SENTRY_DSN` is set.

**Tests:** in-memory exporters for OpenTelemetry and an in-memory transport for Sentry in unit tests; a browser test checks that request traces reach a fake collector and a fake Sentry, for both frameworks.

**Later:** browser error reporting, and source maps for Sentry.

## Ongoing

- Keep framework and provider dependencies current (Next.js, TanStack Start, Better Auth, Drizzle, PGlite), with each update going through the full `starter.yml` matrix.
- Keep `pnpm check:services` and the local-infra jobs covering every service the Starter can use.
- Every new module must survive `add`, `remove`, and `upgrade`: the CLI's change-modules and upgrade-project jobs exercise them, so blocks in code stay additive and variants stay in `variants/`.

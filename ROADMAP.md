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

## Phase 7: Email

**Goal:** projects can send email, and the auth flows that need it work: password reset and email verification.

**Module:** `email`, with the options `resend` (default), `smtp`, and `none`.

**Packages:**

- `packages/email`: the `EmailProvider` interface (`send({ to, subject, html, text })`), plus in-memory and console implementations for tests and for projects without a provider.
- `packages/email-resend`: the Resend SDK.
- `packages/email-smtp`: Nodemailer, for any SMTP server, including the local inboxes below.
- Templates for verification and password reset, as plain functions that return HTML and text. No template framework, so the output stays easy to change.

**Auth integration:**

- Better Auth: wire `sendResetPassword` and `sendVerificationEmail` to the email provider; add the forgot-password and reset-password pages to both apps; make verification optional through an environment variable.
- Supabase Auth sends its own emails. Document how to point it at the same SMTP server, and set the local inbox in `supabase/config.toml`.
- `auth=none` keeps the email module usable for application email.

**Local development:**

- `--infra docker`: add Mailpit to `docker-compose.dev.yml` (SMTP on 1025, web inbox on 8025) and point `SMTP_URL` at it.
- `--infra supabase`: use the stack's Inbucket for Supabase Auth; the app's own email goes to the same inbox over SMTP.
- `--infra local`: the console provider prints emails and their links to the terminal.

**Tests:**

- Unit tests for the providers and templates.
- `check:services` sends a test message when a provider is configured.
- A browser test in `starter.yml`: sign up, read the verification link from Mailpit's API, verify, sign out, reset the password through the emailed link, and sign in with the new password.

**Open questions:** whether verification should be required by default for Better Auth, and whether to offer a second hosted provider (Postmark or Amazon SES) in the first release.

## Phase 8: Deployment

**Goal:** a generated project can go from `pnpm dev` to production with one documented path per platform.

**Module:** `deploy`, with the options `docker` (default, today's behavior), `vercel`, `fly`, `railway`, and `none`.

**Per option:**

- **docker:** the existing production image and `docker-compose.yml`, plus a documented migration step that runs before the new version starts.
- **vercel:** `vercel.json`, Next.js-specific build settings, and guidance for the TanStack Start app's Nitro preset; Postgres connection pooling notes (transaction pooler, `prepare: false`, already configured in `packages/db`).
- **fly:** `fly.toml` built from the existing Dockerfile, a release command that runs `pnpm db:migrate`, and health checks on `/api/health`.
- **railway:** `railway.json` with the same release command and health check.

**Shared work:**

- A deployment section in SETUP.md for the chosen platform: required environment variables per module, how to run migrations, and how to roll back.
- An optional `deploy.yml` workflow, triggered manually, that builds and deploys with the platform's official action.
- Production checks in the health endpoint for the configured services, without exposing details.

**Tests:** `starter.yml` validates each platform's config file against the platform's schema or CLI (`flyctl config validate`, for example) and builds the production artifact each platform uses. Real deployments stay out of CI.

## Phase 9: Payments

**Goal:** subscription billing that is safe by default.

**Module:** `payments`, with the options `stripe` and `none` (default).

**Scope:**

- `packages/payments` (interface) and `packages/payments-stripe` (Stripe SDK).
- Checkout and the customer portal from the dashboard, for the signed-in user.
- A webhook route in both apps that verifies signatures, is idempotent (processed event IDs are stored), and keeps a `subscriptions` table in sync. The table has its own Drizzle migrations, like `auth-better-auth`.
- Plans defined in code and mapped to Stripe price IDs through environment variables.
- Requires an auth module other than `none` (expressed with `requires` in the manifest).

**Local development:** the Stripe CLI forwards webhooks (`stripe listen`), documented per infra option. Test mode keys only in examples.

**Tests:** unit tests for the webhook handler with signed fixture events; a `starter.yml` job that replays fixture events against a generated project and checks the `subscriptions` table.

## Phase 10: Background jobs and observability

**Jobs module:** `jobs`, with the options `pg-boss` (jobs stored in the project's PostgreSQL, no new service) and `none` (default). It adds a worker process next to the app (`pnpm dev` starts it, like the local database), scheduled jobs, retries, and a dashboard page listing recent jobs. Moving email sending (Phase 7) onto the queue becomes an option.

**Observability module:** `observability`, with the options `sentry`, `otel` (OpenTelemetry export to any collector), and `none` (default). It covers error reporting from both frameworks, request tracing through the composition roots, and structured logs that already flow through `@clubedge/core` errors.

**Tests:** a job that enqueues work, runs the worker, and asserts the result against a local database; for observability, an in-memory exporter in unit tests and a check that nothing is sent when the module is `none`.

## Ongoing

- Keep framework and provider dependencies current (Next.js, TanStack Start, Better Auth, Drizzle, PGlite), with each update going through the full `starter.yml` matrix.
- Keep `pnpm check:services` and the local-infra jobs covering every service the Starter can use.
- Every new module must survive `add`, `remove`, and `upgrade`: the CLI's change-modules and upgrade-project jobs exercise them, so blocks in code stay additive and variants stay in `variants/`.

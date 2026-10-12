# Setup guide

This guide covers local development and provider setup. Start with the [README](README.md) for the architecture overview.

## Install the toolchain

Install Node.js 22.12 or newer, then enable Corepack and install pnpm dependencies from the repository root:

```sh
corepack enable
pnpm install
```

The root `package.json` pins pnpm 10.9.0 through its `packageManager` field. Use a compatible pnpm 10 release if Corepack is not available.

If pnpm reports that it ignored a package build script needed by your environment, review the package name and approve only the required dependency with `pnpm approve-builds`.

## Configure the local environment

Copy `.env.example` to `apps/web/.env.local`.

PowerShell:

```powershell
Copy-Item .env.example apps/web/.env.local
```

macOS/Linux:

```sh
cp .env.example apps/web/.env.local
```

The example file points at the local services described in [Local services](#local-services) and leaves provider keys blank, so the app builds and starts before anything is configured. <!-- clubedge:only infra!=none -->
The example file leaves provider URLs and keys blank so the app can build and start without connecting to real services. At minimum, set `DATABASE_URL`. <!-- clubedge:only infra=none -->

The variables are:

- `DATABASE_URL` (required): PostgreSQL connection URL, such as a Supabase transaction pooler URL.
- `NEXT_PUBLIC_APP_URL` (recommended): the app's origin, defaulting to `http://localhost:3000`. <!-- clubedge:only framework=next -->
- `APP_URL` (recommended): the app's origin, defaulting to `http://localhost:3000`. <!-- clubedge:only framework=tanstack-start -->
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (for sign-in): see [Supabase Auth](#supabase-auth). <!-- clubedge:only framework=next && auth=supabase -->
- `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (for sign-in): see [Supabase Auth](#supabase-auth). <!-- clubedge:only framework=tanstack-start && auth=supabase -->
- `BETTER_AUTH_SECRET` (for sign-in): see [Better Auth](#better-auth). <!-- clubedge:only auth=better-auth -->
- `REDIS_URL` (optional): see [Redis](#redis). <!-- clubedge:only cache=redis -->
- `SMTP_URL` and `EMAIL_FROM` (for sending email): see [Email](#email). <!-- clubedge:only email=smtp -->
- `RESEND_API_KEY` and `EMAIL_FROM` (for sending email): see [Email](#email). <!-- clubedge:only email=resend -->
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `STRIPE_PRICE_<PLAN>` (for payments): see [Payments](#payments). <!-- clubedge:only payments=stripe -->
- `JOBS_WORKER` and `CRON_SECRET` (optional): see [Background jobs](#background-jobs). <!-- clubedge:only jobs=pg-boss -->
- `OTEL_EXPORTER_OTLP_ENDPOINT` (to send traces and errors): see [Observability](#observability). <!-- clubedge:only observability=otel -->
- `SENTRY_DSN` (to send errors and traces): see [Observability](#observability). <!-- clubedge:only observability=sentry -->
- `STORAGE_*` (for file storage): see [File storage](#file-storage). <!-- clubedge:only storage=s3 -->
- `SUPABASE_STORAGE_BUCKET` (for file storage): see [File storage](#file-storage). <!-- clubedge:only storage=supabase -->

`DATABASE_URL` must be a non-empty string for server environment validation. If you are only exploring the UI, a local placeholder URL works, but database operations fail until it points to a real PostgreSQL database.

Start the development server:

```sh
pnpm dev
```

The app is available at <http://localhost:3000>, the liveness endpoint at <http://localhost:3000/api/health>, and the readiness endpoint, which also checks the database, at <http://localhost:3000/api/ready>.

<!-- clubedge:if auth=supabase -->

## Supabase Auth

Create or select a Supabase project and copy its URL and publishable key from the project's API settings into the Supabase variables above. Authentication runs on the server, which validates every user with Supabase, and the publishable key is all sign-in needs. To let users delete their account from the settings page, also set `SUPABASE_SECRET_KEY` to a secret key from the same settings; it stays on the server, so never give it a `NEXT_PUBLIC_` prefix. <!-- clubedge:only framework=next -->
Create or select a Supabase project and copy its URL and publishable key from the project's API settings into the Supabase variables above. Authentication runs on the server, which validates every user with Supabase, and the publishable key is all sign-in needs. To let users delete their account from the settings page, also set `SUPABASE_SECRET_KEY` to a secret key from the same settings; it stays on the server. <!-- clubedge:only framework=tanstack-start -->

In Supabase Auth URL configuration, add this redirect URL for local email confirmation and password reset links:

```text
http://localhost:3000/auth/callback**
```

For deployed environments, add your deployed origin followed by `/auth/callback**`. The `**` lets links carry the page to open next, such as `/reset-password`. Supabase sends the confirmation and password reset emails itself; configure its SMTP settings in the Supabase project to send them from your own domain. Until the Supabase variables are set, the dashboard stays viewable as a demo and the login page explains what is missing; once they are set, the dashboard redirects signed-out visitors to the login page.

<!-- clubedge:end -->

<!-- clubedge:if auth=better-auth -->

## Better Auth

Better Auth keeps users, passwords, and sessions in your PostgreSQL database, in its own `auth_*` tables with a separate migration history (`packages/auth-better-auth/drizzle`). Set `DATABASE_URL` and apply the migrations (see [Set up the database](#set-up-the-database)), then set a secret of at least 32 random characters:

```sh
openssl rand -base64 32
```

Put the result in `BETTER_AUTH_SECRET`. Until it is set, the dashboard stays viewable as a demo and the login page explains what is missing; once it is set, the dashboard redirects signed-out visitors to the login page. Signing in again on another device creates another session row, and signing out deletes it.

Sign-up signs the user in immediately; add email verification in `packages/auth-better-auth` if your application needs it. <!-- clubedge:only email=none -->
Better Auth sends its emails through the [email module](#email): <!-- clubedge:only email!=none -->

- **Password reset:** "Forgot password?" on the login page emails a link to `/reset-password`, valid for one hour and usable once. <!-- clubedge:only email!=none -->
- **Email verification:** every new account gets a confirmation link. Sign-up signs the user in right away unless `BETTER_AUTH_REQUIRE_EMAIL_VERIFICATION=true`, which refuses sign-in until the link is opened. <!-- clubedge:only email!=none -->

These emails are sent by the `send-email` [background job](#background-jobs), so sign-up never waits for the email provider, and a failed send is retried with backoff. <!-- clubedge:only email!=none && jobs!=none -->

<!-- clubedge:end -->

## Local services

<!-- clubedge:if infra=docker -->

`docker-compose.dev.yml` runs the services this project uses on your machine, listening on `127.0.0.1` only. Install Docker Desktop (or Docker Engine with Compose), then:

```sh
pnpm infra:up      # start and wait until every service is healthy
pnpm db:migrate    # create the tables
pnpm check:services
```

- PostgreSQL 17 on port 5432, database `app`, user and password `postgres`. Data survives restarts in a Docker volume.
- Redis on port 6379. <!-- clubedge:only cache=redis -->
- S3-compatible storage (adobe/s3mock) on port 9090 with the bucket `app`. It accepts any credentials and is for development only. <!-- clubedge:only storage=s3 -->
- Mailpit, which catches every email the app sends: SMTP on port 1025, and the inbox at http://localhost:8025. <!-- clubedge:only email=smtp -->

`pnpm infra:down` stops the services, `pnpm infra:reset` also deletes their data, and `pnpm infra:logs` follows their logs. The file is for development; in production, point the same variables at managed services.

<!-- clubedge:end -->
<!-- clubedge:if infra=supabase -->

`supabase/config.toml` configures the Supabase CLI's local stack: PostgreSQL, Auth, Storage, the Studio dashboard, and an inbox that captures emails. The CLI runs it in Docker, so install Docker Desktop first. Then:

```sh
pnpm infra:up       # start the stack (the first run downloads its images)
pnpm infra:status   # print the local URLs and keys
pnpm db:migrate
pnpm check:services
```

The database is on port 54322 and the API on port 54321, matching the example environment. Copy the publishable key from `pnpm infra:status` into the Supabase variables. Email confirmation is off locally, so sign-up signs the user in directly. `pnpm infra:down` stops the stack and `pnpm infra:reset` also deletes its data.

The app's own email goes to the same inbox over SMTP, on port 54325. <!-- clubedge:only email=smtp -->

<!-- clubedge:end -->
<!-- clubedge:if infra=local -->

This project runs its development services without Docker or any other installation:

- **PostgreSQL:** `pnpm dev` also starts [PGlite](https://pglite.dev), PostgreSQL compiled to WebAssembly, and serves it on `127.0.0.1:5433`. Each start applies the migrations. Data is kept in `.data/pglite`. `pnpm infra:up` runs the database on its own, for `pnpm check:services` or browser tests.
- **Files:** while `STORAGE_DIRECTORY` is set, uploads are stored in that folder (`.data/storage`) instead of S3. Set the S3 variables and remove `STORAGE_DIRECTORY` to use object storage. <!-- clubedge:only storage=s3 -->
- **Cache:** without `REDIS_URL`, the cache and rate limits use process memory. <!-- clubedge:only cache=redis -->
- **Email:** without a provider configured, emails are printed to the `pnpm dev` output, links included. <!-- clubedge:only email!=none -->

PGlite runs a single database session, so connections take turns. That is plenty for development but not for production: deploy against a managed PostgreSQL by setting `DATABASE_URL`. Supabase Auth and Supabase Storage need a Supabase project, local or hosted. Better Auth works fully offline. `pnpm infra:reset` deletes everything in `.data/`.

<!-- clubedge:end -->
<!-- clubedge:if infra=none -->

This project does not include local service definitions. Point `DATABASE_URL` and the provider variables at services you run yourself or at hosted ones, such as Supabase or Neon for PostgreSQL and Upstash for Redis, then run `pnpm check:services` to confirm the app can reach them.

<!-- clubedge:end -->

## Set up the database

Application tables are managed with Drizzle. Keep one migration source of truth for application tables: do not also create an independent Supabase migration history for those same tables.

From the repository root:

```sh
pnpm db:check
pnpm db:generate
pnpm db:migrate
```

`db:generate` creates migration files from `packages/db/src/schema` into `packages/db/drizzle`; review and commit those files. Better Auth's tables have their own schema and migrations in `packages/auth-better-auth`, applied by the same commands. <!-- clubedge:only auth=better-auth -->
`db:generate` creates migration files from `packages/db/src/schema` into `packages/db/drizzle`; review and commit those files. <!-- clubedge:only auth!=better-auth -->

`db:migrate` applies committed migrations. `db:push` is available for local development, but do not use it as a production migration workflow. Use `pnpm db:seed` only against a database where seed data is appropriate. The database commands run in `packages/db` and read `DATABASE_URL` from `apps/web/.env.local`, so the project keeps one environment file. The Postgres.js client is configured with `prepare: false` for compatibility with Supabase transaction pooling.

<!-- clubedge:if cache=redis -->

## Redis

Redis is optional. Set `REDIS_URL` to a TCP connection URL:

```dotenv
REDIS_URL=rediss://default:<password>@<host>:6379
```

Use `rediss://` for TLS connections such as Upstash and `redis://` for an unencrypted connection on a trusted network. The app uses the standard Redis protocol and requires a Node.js runtime with outbound TCP access.

Without `REDIS_URL`, the rate limiter and cache use process memory. Memory limits apply per server process, so configure Redis when you run several instances or serverless functions. Never commit a real Redis URL or password.

<!-- clubedge:end -->
<!-- clubedge:if cache=memory -->

## Cache and rate limits

The rate limiter and cache keep their state in process memory, which suits a single server instance. Limits and cached values are not shared between instances and reset on restart.

<!-- clubedge:end -->
<!-- clubedge:if email!=none -->

## Email

The app sends email through the `EmailProvider` in `apps/web/src/server/email.ts`. Server code imports `email` from `@/server/email` and calls `email.send({ to, subject, text, html })`.

<!-- clubedge:end -->
<!-- clubedge:if email=smtp -->

Set `SMTP_URL` to any SMTP server, for example `smtps://user:password@smtp.example.com:465`, and `EMAIL_FROM` to the sender, as `Name <address>` or an address. Most email providers (Resend, Postmark, Amazon SES, SendGrid, Mailgun) offer an SMTP endpoint.

<!-- clubedge:end -->
<!-- clubedge:if email=resend -->

Set `RESEND_API_KEY` to a [Resend](https://resend.com) API key and `EMAIL_FROM` to a sender on a domain you verified in Resend, as `Name <address>` or an address. A key limited to sending is enough.

<!-- clubedge:end -->
<!-- clubedge:if email!=none -->

Without a provider configured, development prints each email to the server log, so you can open links from the terminal, and production refuses to send. `pnpm check:services` confirms that the provider accepts the settings without sending anything.

<!-- clubedge:end -->
<!-- clubedge:if payments!=none -->

## Payments

The plans users can buy are in `apps/web/src/config/plans.ts`, with the app's own ids. The dashboard's billing card offers checkout for each plan, then shows the subscription and opens billing management. Server code reads a user's plan with `getBilling().subscriptionFor(userId)` and `isEntitled` from `@/server/payments`, and the `subscriptions` table keeps it in sync through the provider's webhook at `/api/webhooks/payments`.

<!-- clubedge:end -->
<!-- clubedge:if payments=stripe -->

[Stripe](https://stripe.com) runs checkout and billing management. In test mode:

1. Copy the secret key from the dashboard's API keys into `STRIPE_SECRET_KEY`.
2. Create a recurring price for each plan and put its id in `STRIPE_PRICE_<PLAN>`, such as `STRIPE_PRICE_PRO`.
3. Forward webhooks to your machine with the [Stripe CLI](https://docs.stripe.com/stripe-cli), and put the signing secret it prints in `STRIPE_WEBHOOK_SECRET`:

```sh
stripe listen --forward-to localhost:3000/api/webhooks/payments
```

Turn on the customer portal in the dashboard's billing settings, so "Manage billing" works. In production, add a webhook endpoint for `https://<your-domain>/api/webhooks/payments` with the events `checkout.session.completed` and `customer.subscription.created`, `.updated`, `.deleted`, `.paused`, and `.resumed`, and use its signing secret. Every webhook's signature is verified, each event is applied once, and subscription events read the subscription's current state from Stripe, so retried or out-of-order deliveries are safe.

<!-- clubedge:end -->
<!-- clubedge:if payments!=none -->

Payments go through the provider-neutral `PaymentProvider` interface in `packages/payments`. To use another provider, implement that interface in a new package and return it from `apps/web/src/server/payments.ts`; billing logic, the tables, the routes, and the billing card stay the same.

<!-- clubedge:end -->
<!-- clubedge:if jobs=pg-boss -->

## Background jobs

Jobs run outside requests, with retries, in a worker that starts inside the app server: `pnpm dev` and the production server both run it, so there is no separate process to deploy. [pg-boss](https://github.com/timgit/pg-boss) stores them in your PostgreSQL, and creates and upgrades its own tables in the `pgboss` schema when the app starts.

Define a job in `apps/web/src/jobs` and add it to the list in `apps/web/src/jobs/index.ts`:

```ts
import { defineJob } from "@clubedge/jobs";

export const welcomeEmail = defineJob<{ userId: string }>({
  name: "welcome-email",
  retryLimit: 3,
  async run({ userId }) {
    // Look the user up and send the email.
  },
});
```

Queue it from server code with `getJobs().enqueue(welcomeEmail, { userId })`, from `@/server/jobs`. To send any email in the background, enqueue `sendEmailJob` from `@/jobs` with the message, as the auth emails do. A thrown error fails the attempt and the job is retried (`retryLimit`, `retryDelaySeconds`, `retryBackoff`). An attempt that runs past `timeoutSeconds`, or whose server stops, is retried too, so make jobs safe to run twice. Add `schedule: "0 3 * * *"` (cron syntax) to run a job on a schedule. Restart `pnpm dev` after adding or changing a job. The dashboard's jobs card queues the sample job from `apps/web/src/jobs/sample.ts` and lists its recent runs; remove both when you add your own. <!-- clubedge:only email!=none -->
Queue it from server code with `getJobs().enqueue(welcomeEmail, { userId })`, from `@/server/jobs`. A thrown error fails the attempt and the job is retried (`retryLimit`, `retryDelaySeconds`, `retryBackoff`). An attempt that runs past `timeoutSeconds`, or whose server stops, is retried too, so make jobs safe to run twice. Add `schedule: "0 3 * * *"` (cron syntax) to run a job on a schedule. Restart `pnpm dev` after adding or changing a job. The dashboard's jobs card queues the sample job from `apps/web/src/jobs/sample.ts` and lists its recent runs; remove both when you add your own. <!-- clubedge:only email=none -->

Where no server keeps running, as on Vercel and Netlify, there is no worker: `JOBS_WORKER` defaults to `off` there, and you can set it yourself anywhere. Set `CRON_SECRET` to 16 or more random characters and call `GET /api/jobs/run` every minute or so with the header `Authorization: Bearer <CRON_SECRET>`, from Vercel Cron, a Netlify scheduled function, or any scheduler. Each call runs the jobs that are due. Scheduled jobs need a worker.

Jobs go through the provider-neutral `JobQueue` interface in `packages/jobs`. To use another queue, implement that interface in a new package and return it from `apps/web/src/server/jobs.ts`; job definitions, the routes, and the jobs card stay the same.

<!-- clubedge:end -->
<!-- clubedge:if observability!=none -->

## Observability

Server errors and traces go to the tool you chose. Errors that escape a page, route, server action, or server function are sent with the request's method and path, and so are errors the app handles and reports with `reportError` from `@clubedge/core`, such as a failed webhook, email, or background job. Every request is traced, and so are calls through the email, storage, and payments composition roots, as spans such as `email.send` and `storage.upload`. Wrap your own work with `traced("name", () => work())` from `@clubedge/core`. Until the tool is configured nothing is sent, and errors keep going to the server log.

<!-- clubedge:end -->
<!-- clubedge:if observability=otel -->

Set `OTEL_EXPORTER_OTLP_ENDPOINT` to an OpenTelemetry collector or to a vendor's OTLP/HTTP endpoint (Grafana Cloud, Honeycomb, Datadog, and others accept it), with any API key in `OTEL_EXPORTER_OTLP_HEADERS` as `key=value` pairs. Traces go to `/v1/traces` and errors to `/v1/logs` as error log records, and each error is also recorded on the span it happened in. `OTEL_SERVICE_NAME` defaults to the project's service id. The spans Next.js and pg-boss create join the same traces. <!-- clubedge:only framework=next -->
Set `OTEL_EXPORTER_OTLP_ENDPOINT` to an OpenTelemetry collector or to a vendor's OTLP/HTTP endpoint (Grafana Cloud, Honeycomb, Datadog, and others accept it), with any API key in `OTEL_EXPORTER_OTLP_HEADERS` as `key=value` pairs. Traces go to `/v1/traces` and errors to `/v1/logs` as error log records, and each error is also recorded on the span it happened in. `OTEL_SERVICE_NAME` defaults to the project's service id. <!-- clubedge:only framework=tanstack-start -->

To see traces during development, run [Jaeger](https://www.jaegertracing.io), set `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318`, and open http://localhost:16686:

```sh
docker run --rm -p 16686:16686 -p 4318:4318 jaegertracing/jaeger:latest
```

<!-- clubedge:end -->
<!-- clubedge:if observability=sentry -->

Create a Node.js project in [Sentry](https://sentry.io) and set `SENTRY_DSN` to its DSN. `SENTRY_TRACES_SAMPLE_RATE` is the share of requests traced, from 0 to 1 (default 0.1; use 1 while trying it out), and `SENTRY_ENVIRONMENT` labels events (default `NODE_ENV`). The SDK sends no user details, cookies, query strings, or request bodies. The spans Next.js and pg-boss create join the same traces. <!-- clubedge:only framework=next -->
Create a Node.js project in [Sentry](https://sentry.io) and set `SENTRY_DSN` to its DSN. `SENTRY_TRACES_SAMPLE_RATE` is the share of requests traced, from 0 to 1 (default 0.1; use 1 while trying it out), and `SENTRY_ENVIRONMENT` labels events (default `NODE_ENV`). The SDK sends no user details, cookies, query strings, or request bodies. <!-- clubedge:only framework=tanstack-start -->

To see your own code in browser stack traces, give the build `SENTRY_AUTH_TOKEN` (an auth token with the `project:releases` scope), `SENTRY_ORG`, and `SENTRY_PROJECT`. The build then makes source maps for the browser bundle, uploads them to Sentry, and deletes them, so they are never served. Without the token the build makes no source maps. Set the three variables where the build runs: in CI, or as build-time variables on your platform.

<!-- clubedge:end -->
<!-- clubedge:if observability!=none -->

Uncaught errors in the browser are reported too, with the page's path and no query string. With OpenTelemetry, the browser sends them to `/api/client-errors`, which reports them like server errors and accepts 30 reports a minute per address. With Sentry, Sentry's browser SDK sends them directly; it is downloaded only when `SENTRY_DSN` is set. In both cases the browser reads its settings from `/api/client-errors` at runtime, so builds never bake them in.

On Vercel and Netlify, a function can stop right after it responds, so spans still waiting in a batch at that moment can be lost.

Observability goes through the provider-neutral `ObservabilityProvider` interface in `packages/observability` and the telemetry hooks in `@clubedge/core`. To use another tool, implement that interface in a new package and install it from `apps/web/src/server/observability.ts`; error reports and spans across the app stay the same.

<!-- clubedge:end -->
<!-- clubedge:if storage!=none -->

## File storage

<!-- clubedge:end -->
<!-- clubedge:if storage=s3 -->

The storage adapter works with AWS S3 and S3-compatible providers such as Cloudflare R2 and MinIO. Configure `STORAGE_BUCKET`, `STORAGE_REGION`, `STORAGE_ENDPOINT` when required, and the access key, secret, and optional public URL. For R2, use the account's S3 API endpoint and region `auto`.

<!-- clubedge:end -->
<!-- clubedge:if storage=supabase -->

The storage adapter uses Supabase Storage through the signed-in user's Supabase session, so bucket policies can rely on that user. Set `SUPABASE_STORAGE_BUCKET` and choose a bucket policy that matches your application's access model.

<!-- clubedge:end -->
<!-- clubedge:if storage!=none -->

The storage adapter does not authorize users or validate uploads. Before calling it, the route must check ownership and authorization, file size, content type, and the object key. Keep credentials server side.

<!-- clubedge:end -->

## Shared UI development

The app's `components.json` and `packages/ui/components.json` direct the shadcn CLI into the shared `packages/ui` package. The selected `base-nova` style uses `@base-ui/react` primitives, not Radix UI. Tailwind CSS 4 and semantic theme tokens are defined in `packages/ui/src/styles/globals.css` and imported by the app's root route.

Generate a shared component from the repository root:

```sh
pnpm dlx shadcn@latest add badge -c apps/web
```

Shared components live in `packages/ui/src/components` and are imported from `@clubedge/ui/components/<component>`. Keep both `components.json` files aligned when changing the shadcn style, Tailwind CSS entry, base color, icon library, or RTL setting. The `rtl` setting makes newly generated components RTL-aware; set `lang` and `dir` on the root `<html>` element to match your application's actual locale. App-specific components belong in `apps/web/src/components`.

The root route is a public landing page; the reference dashboard is available at `/dashboard`. The dashboard uses the shared shadcn sidebar and breadcrumb. A light/dark switch is available in the landing page and dashboard navigation; its choice is saved in local storage and the initial theme follows the system preference until the user selects one. Theme colors are centralized in `packages/ui/src/styles/globals.css` (blue `#2563eb`, dark background `#151515`).

## Docker

Create `apps/web/.env.local` first. Start the development image with:

```sh
pnpm docker:dev
```

Build a production image and run it with:

```sh
pnpm docker:build
pnpm docker:start
```

The image runs the Next.js standalone output as an unprivileged user. Ensure the configured database and provider hosts are reachable from the container. <!-- clubedge:only framework=next -->
The image runs the self-contained Nitro server bundle as an unprivileged user, with no `node_modules`. Ensure the configured database and provider hosts are reachable from the container. <!-- clubedge:only framework=tanstack-start -->

The image also contains the production migrator, which applies every package's migrations with only `DATABASE_URL`:

```sh
docker run --rm --env DATABASE_URL="postgresql://..." <image> node /app/migrate.mjs
```

Run it before a new version starts serving; it skips migrations that are already applied.

## Deploy

<!-- clubedge:if deploy=docker -->

Run the production image on any host or orchestrator that runs containers: build it with `pnpm docker:build` or in CI, push it to a registry, and start it with the production environment. Before each release, run the migrator above as a one-off task (a Kubernetes Job, an ECS task, or `docker run`), then roll out the new containers. Point the platform's health check at `/api/health`.

<!-- clubedge:end -->
<!-- clubedge:if deploy=fly -->

`fly.toml` deploys the production image to [Fly.io](https://fly.io):

```sh
fly launch --no-deploy        # creates the app; keep the existing fly.toml
fly secrets set DATABASE_URL="postgresql://..."
fly deploy
```

Set the other production variables listed below with `fly secrets set`. Each deploy runs `node /app/migrate.mjs` as its release command, in a temporary machine, before the new version replaces the old one; a failed migration stops the deploy. Health checks call `/api/health`.

<!-- clubedge:end -->
<!-- clubedge:if deploy=railway -->

`railway.json` deploys the production image to [Railway](https://railway.com): create a project from this repository, add the production variables listed below to the service, and deploy. Railway runs `node /app/migrate.mjs` as the pre-deploy command, so a failed migration stops the release, and checks `/api/health` before switching traffic.

<!-- clubedge:end -->
<!-- clubedge:if deploy=render -->

`render.yaml` is a [Render](https://render.com) Blueprint: in the dashboard, choose New, then Blueprint, and select this repository. Render asks for each variable marked `sync: false` and generates `BETTER_AUTH_SECRET`. <!-- clubedge:only auth=better-auth -->
`render.yaml` is a [Render](https://render.com) Blueprint: in the dashboard, choose New, then Blueprint, and select this repository. Render asks for each variable marked `sync: false`. <!-- clubedge:only auth!=better-auth -->

Render runs `node /app/migrate.mjs` as the pre-deploy command before each deploy goes live, and a failed migration stops the deploy. Pre-deploy commands need a paid instance type. On the free type, remove `preDeployCommand` from `render.yaml` and apply migrations yourself before deploying, from your machine or CI, with `DATABASE_URL` set to the production database: `pnpm db:migrate`, or the migrator in the image as shown above. Health checks call `/api/health`.

<!-- clubedge:end -->
<!-- clubedge:if deploy=vercel -->

`apps/web/vercel.json` deploys the app to [Vercel](https://vercel.com). Import the repository, set the project's Root Directory to `apps/web`, add the production variables listed below, and deploy. Vercel installs the whole pnpm workspace and builds the app. <!-- clubedge:only framework=next -->
`apps/web/vercel.json` deploys the app to [Vercel](https://vercel.com). Import the repository, set the project's Root Directory to `apps/web`, add the production variables listed below, and deploy. The build detects Vercel and writes Vercel's Build Output, with server routes as functions. <!-- clubedge:only framework=tanstack-start -->

Vercel has no step that runs before a release, so the build command applies migrations (`pnpm db:migrate`) against the `DATABASE_URL` of the deployment's environment. Give Preview deployments their own database, or remove the migration step from `buildCommand` and run migrations yourself. Serverless functions open a connection per instance: use your provider's pooled connection URL (for example Supabase's transaction pooler or Neon's pooled endpoint).

Vercel runs no worker for [background jobs](#background-jobs). Set `CRON_SECRET` and add `"crons": [{ "path": "/api/jobs/run", "schedule": "* * * * *" }]` to `vercel.json`; Vercel Cron sends the secret itself. Cron jobs more frequent than daily need a paid Vercel plan; otherwise call the endpoint from another scheduler. <!-- clubedge:only jobs=pg-boss -->

<!-- clubedge:end -->
<!-- clubedge:if deploy=netlify -->

`apps/web/netlify.toml` deploys the app to [Netlify](https://www.netlify.com). Import the repository, set the site's Base directory to `apps/web`, add the production variables listed below, and deploy. Netlify installs its Next.js runtime automatically. <!-- clubedge:only framework=next -->
`apps/web/netlify.toml` deploys the app to [Netlify](https://www.netlify.com). Import the repository, set the site's Base directory to `apps/web`, add the production variables listed below, and deploy. The build detects Netlify and writes its functions and static assets. <!-- clubedge:only framework=tanstack-start -->

Netlify has no step that runs before a release, so the build command applies migrations (`pnpm db:migrate`) against the `DATABASE_URL` of the deploy context. Give deploy previews their own database, or remove the migration step from the build command and run migrations yourself. Serverless functions open a connection per instance: use your provider's pooled connection URL (for example Supabase's transaction pooler or Neon's pooled endpoint).

Netlify runs no worker for [background jobs](#background-jobs). Set `JOBS_WORKER=off` and `CRON_SECRET`, then call `/api/jobs/run` every minute from a [scheduled function](https://docs.netlify.com/build/functions/scheduled-functions/) or another scheduler, with the header `Authorization: Bearer <CRON_SECRET>`. <!-- clubedge:only jobs=pg-boss -->

<!-- clubedge:end -->

`.github/workflows/deploy.yml` deploys on demand: in GitHub, open Actions, then Deploy, then Run workflow.

- It builds the production image and publishes it to this repository's GitHub Container Registry as `ghcr.io/<owner>/<repository>`, tagged with the commit and `latest`, using the workflow's own token. Run the migrator from that image before rolling it out. <!-- clubedge:only deploy=docker -->
- It needs the secret `FLY_API_TOKEN`, from `fly tokens create deploy`. <!-- clubedge:only deploy=fly -->
- It needs the secret `RAILWAY_TOKEN`, a project token from the project's settings, and the variable `RAILWAY_SERVICE`, the service's name. <!-- clubedge:only deploy=railway -->
- It needs the secret `RENDER_DEPLOY_HOOK_URL`, the deploy hook from the service's settings. <!-- clubedge:only deploy=render -->
- It needs the secrets `VERCEL_TOKEN`, from your account settings, and `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`, which `vercel link` writes to `.vercel/project.json`. <!-- clubedge:only deploy=vercel -->
- It needs the secrets `NETLIFY_AUTH_TOKEN`, a personal access token, and `NETLIFY_SITE_ID`, from the site's settings. <!-- clubedge:only deploy=netlify -->

`/api/health` answers as long as the app runs, so platforms use it to decide whether to restart the app. `/api/ready` also checks that the database answers, returning 200 or 503 without details: point load balancers and readiness probes at it, so traffic waits while the database is unreachable instead of the app restarting.

Production needs these variables:

- `DATABASE_URL`, pointing at a managed PostgreSQL database.
- `NEXT_PUBLIC_APP_URL`, the deployed origin. <!-- clubedge:only framework=next -->
- `APP_URL`, the deployed origin. <!-- clubedge:only framework=tanstack-start -->
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, from the Supabase project. <!-- clubedge:only framework=next && auth=supabase -->
- `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`, from the Supabase project. <!-- clubedge:only framework=tanstack-start && auth=supabase -->
- `BETTER_AUTH_SECRET`, at least 32 random characters, different from development. <!-- clubedge:only auth=better-auth -->
- `SUPABASE_SECRET_KEY`, if users should be able to delete their account. <!-- clubedge:only auth=supabase -->
- `SMTP_URL` and `EMAIL_FROM`; without them, production refuses to send email. <!-- clubedge:only email=smtp -->
- `RESEND_API_KEY` and `EMAIL_FROM`; without them, production refuses to send email. <!-- clubedge:only email=resend -->
- `STRIPE_SECRET_KEY` (live mode), `STRIPE_WEBHOOK_SECRET` from the production webhook endpoint, and `STRIPE_PRICE_<PLAN>` for each plan. <!-- clubedge:only payments=stripe -->
- `REDIS_URL`, when you run more than one instance. <!-- clubedge:only cache=redis -->
- `CRON_SECRET`, where no worker runs and a scheduler calls `/api/jobs/run`. <!-- clubedge:only jobs=pg-boss -->
- `OTEL_EXPORTER_OTLP_ENDPOINT`, and `OTEL_EXPORTER_OTLP_HEADERS` if your collector needs a key. <!-- clubedge:only observability=otel -->
- `SENTRY_DSN`, and `SENTRY_ENVIRONMENT` to tell environments apart. <!-- clubedge:only observability=sentry -->
- The `STORAGE_*` variables for your S3-compatible bucket. <!-- clubedge:only storage=s3 -->
- `SUPABASE_STORAGE_BUCKET`. <!-- clubedge:only storage=supabase -->

## Checks

`pnpm clubedge doctor` checks that the project can run: Node.js and pnpm versions, installed dependencies, the lockfile, and `apps/web/.env.local` against the example, followed by `pnpm check:services`. Start there when something does not work.

Run the checks relevant to your change before opening a pull request:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
pnpm build
```

Browser checks use Playwright. Install Chromium once, then run `pnpm test:e2e`:

```sh
pnpm exec playwright install chromium
pnpm test:e2e
```

The Playwright configuration starts the local app with a placeholder database URL; browser scenarios should not require real provider credentials.

<!-- clubedge:if starter-repository -->

## The TanStack Start app

`apps/start` is the same application built with TanStack Start. It reuses every package and differs only in its framework layer:

| Concern               | Next.js (`apps/web`)                   | TanStack Start (`apps/start`)                                   |
| --------------------- | -------------------------------------- | --------------------------------------------------------------- |
| Environment file      | `apps/web/.env.local`                  | `apps/start/.env.local`, from `apps/start/.env.example`         |
| App URL and Supabase  | `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_*` | `APP_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`           |
| Sign-in and sign-up   | Server actions                         | Form posts to `/auth/sign-in` and `/auth/sign-up` server routes |
| Session refresh       | `src/proxy.ts`                         | Request middleware in `src/start.ts`                            |
| Cross-site protection | Built into server actions              | `createCsrfMiddleware` in `src/start.ts`                        |
| Production output     | Next.js standalone (`pnpm start`)      | Nitro `.output` (`pnpm --filter @clubedge/start start`)         |
| Docker image          | `Dockerfile`                           | `apps/start/Dockerfile` (see below)                             |

Run it with `pnpm --filter @clubedge/start dev` and the browser suite with `E2E_APP=start pnpm test:e2e`. The database commands still read `DATABASE_URL` from `apps/web/.env.local`. Build its image from the repository root:

```sh
docker build -f apps/start/Dockerfile --build-arg APP_DIR=apps/start --build-arg APP_PACKAGE=@clubedge/start -t clubedge-starter .
```

In generated projects the app lives in `apps/web`, its Dockerfile is the root `Dockerfile`, and the build arguments are not needed.

<!-- clubedge:end -->

## Before deploying

This project is a starting point; review the security and operational choices for your application before production use:

- Set production environment variables through your hosting provider's secret manager. Use unique, rotated credentials and TLS for external connections.
- Set the app URL variable to the deployed origin and add its `/auth/callback` URL to Supabase's allowed redirect URLs. <!-- clubedge:only auth=supabase -->
- Make authenticated server routes call `getCurrentUser()` or `requireUser()` from `@/server/auth` (the latter throws a 401 `AppError`), and protect pages with `getPageUser`, which redirects signed-out visitors to `/login`. Do not treat cookie contents alone as proof of identity. <!-- clubedge:only auth!=none -->
- Authorize storage access and validate upload size, content type, and object ownership in the route before using the storage adapter. <!-- clubedge:only storage!=none -->
- Configure Redis for rate limiting when you deploy more than one instance; the in-memory fallback does not share counts between instances. <!-- clubedge:only cache=redis -->
- The rate limiter keeps counts in memory, so deploy one instance or switch to a shared store before scaling out. <!-- clubedge:only cache=memory -->
- Client addresses come from `x-forwarded-for`, so deploy behind a proxy that sets it.
- Configure and verify a restrictive Content Security Policy for the scripts and asset origins used by your deployment. A generic policy is not included because it can break framework tooling and project-specific assets.
- Review database migration and backup procedures, provider access policies, and application-specific error handling.

## Troubleshooting

- **Environment validation fails:** confirm you copied the example to `apps/web/.env.local` and set `DATABASE_URL`. The error names the module whose variables are invalid.
- **Auth redirects fail:** add the exact local or deployed `/auth/callback` URL to Supabase Auth's allowed redirect URLs. <!-- clubedge:only auth=supabase -->
- **Database connection fails:** check the URL, network access, and whether your provider expects a transaction pooler. Keep `prepare: false` for the current Supabase pooler setup.
- **Redis cannot connect:** check that the URL uses `redis://` or `rediss://`, credentials are current, and outbound TCP access is allowed. <!-- clubedge:only cache=redis -->
- **Playwright cannot find Chromium:** run `pnpm exec playwright install chromium`.
- **A package file appears missing after an offline install:** retry with a normal registry-backed `pnpm install`; an incomplete local package cache can satisfy offline resolution while leaving package contents incomplete.

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

<!-- clubedge:if framework!=none && infra!=neon -->

Copy `.env.example` to `apps/web/.env.local`.

PowerShell:

```powershell
Copy-Item .env.example apps/web/.env.local
```

macOS/Linux:

```sh
cp .env.example apps/web/.env.local
```

<!-- clubedge:end -->
<!-- clubedge:if framework=none && infra!=neon -->

Copy `apps/api/.env.example` to `apps/api/.env.local`.

PowerShell:

```powershell
Copy-Item apps/api/.env.example apps/api/.env.local
```

macOS/Linux:

```sh
cp apps/api/.env.example apps/api/.env.local
```

<!-- clubedge:end -->

create-clubedge-app created `apps/web/.env.local` from `.env.example`, with the URLs of the Neon database it created: keep that file, since copying the example over it would remove them. <!-- clubedge:only infra=neon && framework=next|tanstack-start -->
create-clubedge-app created the local environment files from their examples, and wrote the URLs of the Neon database it created into `apps/api/.env.local`: keep that file, since copying the example over it would remove them. <!-- clubedge:only infra=neon && framework=vite|none -->

The example file points at the local services described in [Local services](#local-services) and leaves provider keys blank, so the app builds and starts before anything is configured. <!-- clubedge:only infra!=none -->
The example file leaves provider URLs and keys blank so the app can build and start without connecting to real services. At minimum, set `DATABASE_URL`. <!-- clubedge:only infra=none -->

The variables are:

- `DATABASE_URL` (required): PostgreSQL connection URL, such as a Supabase transaction pooler URL.
- `DATABASE_URL_DIRECT` (optional): the same database without a pooler, for migrations and the jobs worker. See [Pooled and direct connections](#pooled-and-direct-connections). <!-- clubedge:only infra=none|neon -->
- `NEXT_PUBLIC_APP_URL` (recommended): the app's origin, defaulting to `http://localhost:3000`. <!-- clubedge:only framework=next -->
- `APP_URL` (recommended): the app's origin, defaulting to `http://localhost:3000`. <!-- clubedge:only framework=tanstack-start -->
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (for sign-in): see [Supabase Auth](#supabase-auth). <!-- clubedge:only framework=next && auth=supabase -->
- `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (for sign-in): see [Supabase Auth](#supabase-auth). <!-- clubedge:only framework=tanstack-start|none && auth=supabase -->
- `BETTER_AUTH_SECRET` (for sign-in): see [Better Auth](#better-auth). <!-- clubedge:only auth=better-auth && framework!=none -->
- `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` (for sign-in): see [Better Auth](#better-auth). <!-- clubedge:only auth=better-auth && framework=none -->
- `FIREBASE_PROJECT_ID`, `FIREBASE_API_KEY`, and in production a service account: see [Firebase Authentication](#firebase-authentication). <!-- clubedge:only auth=firebase && api!=fastapi -->
- `FIREBASE_PROJECT_ID` and `FIREBASE_API_KEY`: see [Firebase Authentication](#firebase-authentication). <!-- clubedge:only auth=firebase && api=fastapi -->
- `APPWRITE_ENDPOINT`, `APPWRITE_PROJECT_ID`, and `APPWRITE_API_KEY` (for sign-in): see [Appwrite](#appwrite). <!-- clubedge:only auth=appwrite -->
- `REDIS_URL` (optional): see [Redis](#redis). <!-- clubedge:only cache=redis -->
- `SMTP_URL` and `EMAIL_FROM` (for sending email): see [Email](#email). <!-- clubedge:only email=smtp -->
- `RESEND_API_KEY` and `EMAIL_FROM` (for sending email): see [Email](#email). <!-- clubedge:only email=resend -->
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `STRIPE_PRICE_<PLAN>` (for payments): see [Payments](#payments). <!-- clubedge:only payments=stripe -->
- `JOBS_WORKER` and `CRON_SECRET` (optional): see [Background jobs](#background-jobs). <!-- clubedge:only jobs=pg-boss|bullmq -->
- `INNGEST_DEV`, `INNGEST_EVENT_KEY`, and `INNGEST_SIGNING_KEY`: see [Background jobs](#background-jobs). <!-- clubedge:only jobs=inngest -->
- `OTEL_EXPORTER_OTLP_ENDPOINT` (to send traces and errors): see [Observability](#observability). <!-- clubedge:only observability=otel -->
- `SENTRY_DSN` (to send errors and traces): see [Observability](#observability). <!-- clubedge:only observability=sentry -->
- `STORAGE_*` (for file storage): see [File storage](#file-storage). <!-- clubedge:only storage=s3 -->
- `SUPABASE_STORAGE_BUCKET` (for file storage): see [File storage](#file-storage). <!-- clubedge:only storage=supabase -->

`DATABASE_URL` must be a non-empty string for server environment validation. If you are only exploring the UI, a local placeholder URL works, but database operations fail until it points to a real PostgreSQL database. <!-- clubedge:only framework!=none -->
The API starts with a local placeholder `DATABASE_URL`, but database operations fail until it points to a real PostgreSQL database. <!-- clubedge:only framework=none -->

Start the development server:

```sh
pnpm dev
```

The app is available at <http://localhost:3000>, the liveness endpoint at <http://localhost:3000/api/health>, and the readiness endpoint, which also checks the database, at <http://localhost:3000/api/ready>. <!-- clubedge:only framework!=none -->
The API listens on port 3001: the liveness endpoint is at <http://localhost:3001/api/health>, and the readiness endpoint, which also checks the database, at <http://localhost:3001/api/ready>. In development it listens on every interface (`HOST=0.0.0.0`), so a phone or another device on the same network reaches it; see [Without a website](#without-a-website). <!-- clubedge:only framework=none -->

<!-- clubedge:if auth=supabase -->

## Supabase Auth

Create or select a Supabase project and copy its URL and publishable key from the project's API settings into the Supabase variables above. Authentication runs on the server, which validates every user with Supabase, and the publishable key is all sign-in needs. To let users delete their account from the settings page, also set `SUPABASE_SECRET_KEY` to a secret key from the same settings; it stays on the server, so never give it a `NEXT_PUBLIC_` prefix. <!-- clubedge:only framework=next -->
Create or select a Supabase project and copy its URL and publishable key from the project's API settings into the Supabase variables above. Authentication runs on the server, which validates every user with Supabase, and the publishable key is all sign-in needs. To let users delete their account from the settings page, also set `SUPABASE_SECRET_KEY` to a secret key from the same settings; it stays on the server. <!-- clubedge:only framework=tanstack-start -->
To let users delete their account from the settings page, set `SUPABASE_SECRET_KEY` in `apps/api/.env.local` to a secret key from the project's API settings; only the API uses it. <!-- clubedge:only framework=vite && api=hono|fastapi -->
Create or select a Supabase project and copy its URL and publishable key from the project's API settings into `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in `apps/api/.env.local`. The API validates the access token each request carries with Supabase, and the publishable key is all it needs. To let users delete their account, also set `SUPABASE_SECRET_KEY` there to a secret key from the same settings; only the API uses it. <!-- clubedge:only framework=none -->

<!-- clubedge:end -->
<!-- clubedge:if auth=supabase && framework!=none -->

In Supabase Auth URL configuration, add this redirect URL for local email confirmation and password reset links:

```text
http://localhost:3000/auth/callback**
```

For deployed environments, add your deployed origin followed by `/auth/callback**`. The `**` lets links carry the page to open next, such as `/reset-password`. Supabase sends the confirmation and password reset emails itself; configure its SMTP settings in the Supabase project to send them from your own domain. Until the Supabase variables are set, the dashboard stays viewable as a demo and the login page explains what is missing; once they are set, the dashboard redirects signed-out visitors to the login page.

<!-- clubedge:end -->
<!-- clubedge:if auth=supabase && framework=none -->

In the Supabase dashboard, under Authentication, URL Configuration, add the native app's address scheme to the Redirect URLs, such as `my-product://**`, where `my-product` is the scheme `apps/mobile/app.config.ts` makes from the site config's `serviceId`. Confirmation and password reset links then open the app: confirming a new account opens its sign-in screen, and a password reset link opens its reset screen, which sets the new password. <!-- clubedge:only mobile!=none -->
The local stack reads its redirect URLs from `additional_redirect_urls` in `supabase/config.toml`: add the scheme there too, and restart the stack. <!-- clubedge:only mobile!=none && infra=supabase -->

Supabase sends the confirmation and password reset emails itself; configure its SMTP settings in the Supabase project to send them from your own domain.
Their links lead to the address the client asks for, once the Redirect URLs in the project's URL configuration list it. <!-- clubedge:only mobile=none -->

<!-- clubedge:end -->

<!-- clubedge:if auth=better-auth -->

## Better Auth

Better Auth keeps users, passwords, and sessions in your PostgreSQL database, in its own `auth_*` tables with a separate migration history (`packages/auth-better-auth/drizzle`). Set `DATABASE_URL` and apply the migrations (see [Set up the database](#set-up-the-database)), then set a secret of at least 32 random characters:

```sh
openssl rand -base64 32
```

Put the result in `BETTER_AUTH_SECRET`. Until it is set, the dashboard stays viewable as a demo and the login page explains what is missing; once it is set, the dashboard redirects signed-out visitors to the login page. Signing in again on another device creates another session row, and signing out deletes it. <!-- clubedge:only framework!=none -->
Put the result in `BETTER_AUTH_SECRET` in `apps/api/.env.local`, and set `BETTER_AUTH_URL` there to the API's public URL: `http://localhost:3001` in development. Better Auth runs in the API, which serves it at `/api/auth`; until the secret is set, no one can sign in. Signing in again on another device creates another session row, and signing out deletes it. <!-- clubedge:only framework=none -->

Sign-up signs the user in immediately; add email verification in `packages/auth-better-auth` if your application needs it. <!-- clubedge:only email=none -->
The frontend's server still sends password reset and verification emails through Resend when `RESEND_API_KEY` and `EMAIL_FROM` are both set in `apps/web/.env.local`. <!-- clubedge:only email=none && api!=none && framework!=none -->
Better Auth sends its emails through the [email module](#email): <!-- clubedge:only email!=none -->

- **Password reset:** "Forgot password?" on the login page emails a link to `/reset-password`, valid for one hour and usable once. <!-- clubedge:only email!=none && framework!=none -->
- **Password reset:** "Forgot your password?" on the native app's sign-in screen emails a link, valid for one hour and usable once, that opens the app's reset screen to set a new password. <!-- clubedge:only email!=none && framework=none && mobile!=none -->
- **Password reset:** a reset request to Better Auth, under `/api/auth`, emails a link valid for one hour and usable once. <!-- clubedge:only email!=none && framework=none && mobile=none -->
- **Email verification:** every new account gets a confirmation link. Sign-up signs the user in right away unless `BETTER_AUTH_REQUIRE_EMAIL_VERIFICATION=true`, which refuses sign-in until the link is opened. <!-- clubedge:only email!=none -->

These emails are sent by the `send-email` [background job](#background-jobs), so sign-up never waits for the email provider, and a failed send is retried with backoff. <!-- clubedge:only email!=none && jobs!=none && framework!=none -->

<!-- clubedge:end -->

<!-- clubedge:if auth=firebase -->

## Firebase Authentication

[Firebase Authentication](https://firebase.google.com/docs/auth) checks passwords and keeps the accounts; the app's own pages sign users in, and the server holds the session in an HTTP-only cookie (a Firebase session cookie, checked for revocation on each request). Password reset and email confirmation links are generated by Firebase and sent through the [email module](#email), so they open the app's own pages and need no setup in the Firebase console. <!-- clubedge:only email!=none && framework=next|tanstack-start -->
[Firebase Authentication](https://firebase.google.com/docs/auth) checks passwords and keeps the accounts; the app's own pages sign users in with Firebase's SDK, which keeps the session in the browser, and send its ID token with each request to the API (`Authorization: Bearer <token>`), which verifies it. Password reset and email confirmation links are generated by Firebase and sent through the [email module](#email), so they open the app's own pages and need no setup in the Firebase console. <!-- clubedge:only email!=none && framework=vite -->
[Firebase Authentication](https://firebase.google.com/docs/auth) checks passwords and keeps the accounts; the app's own pages sign users in, and the server holds the session in an HTTP-only cookie (a Firebase session cookie, checked for revocation on each request). Without the email module there is no password reset. <!-- clubedge:only email=none && framework=next|tanstack-start -->
[Firebase Authentication](https://firebase.google.com/docs/auth) checks passwords and keeps the accounts; the app's own pages sign users in with Firebase's SDK, which keeps the session in the browser, and send its ID token with each request to the API (`Authorization: Bearer <token>`), which verifies it. Without the email module there is no password reset. <!-- clubedge:only email=none && framework=vite -->
[Firebase Authentication](https://firebase.google.com/docs/auth) checks passwords and keeps the accounts. Clients sign users in with Firebase's SDK and send the ID token with each request (`Authorization: Bearer <token>`); the API verifies it, and accepts only confirmed email addresses. <!-- clubedge:only framework=none -->

In development, `pnpm auth:dev` starts Firebase's Auth Emulator (`firebase.json`, port 9099), which the example environment points at: no Firebase project or account is needed. Accounts live in memory until it stops. <!-- clubedge:only framework!=none -->
In development, `pnpm auth:dev` starts Firebase's Auth Emulator (`firebase.json`, port 9099), so no Firebase project or account is needed: point the API at it with `FIREBASE_PROJECT_ID=demo-clubedge` and `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099` in `apps/api/.env.local`. Accounts live in memory until it stops. <!-- clubedge:only framework=none -->

In production:

1. In the [Firebase console](https://console.firebase.google.com), create a project and turn on **Email/Password** under Authentication, Sign-in method.
2. Set `FIREBASE_PROJECT_ID` and `FIREBASE_API_KEY` (the Web API key, under Project settings, General).
3. Under Project settings, Service accounts, generate a private key, and set `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` from it (the key's line breaks as `\n` are fine). <!-- clubedge:only api!=fastapi -->

Remove `FIREBASE_AUTH_EMULATOR_HOST` too: `pnpm check:env` refuses it in production.

The FastAPI API needs no service account: it checks each ID token with Firebase's Identity Toolkit, using the Web API key. <!-- clubedge:only api=fastapi -->

Changing a password or resetting it signs out every other session; deleting an account removes it from Firebase after the app's own data for the user.

<!-- clubedge:end -->

<!-- clubedge:if auth=appwrite -->

## Appwrite

[Appwrite](https://appwrite.io) keeps the accounts, on Appwrite Cloud or your own server; the app's own pages sign users in, and the server holds the session's secret in an HTTP-only cookie (`a_session_<project>`). Appwrite sends the email confirmation and password recovery emails itself, through its SMTP settings, with links back to the app's `/auth/callback` and `/reset-password`. <!-- clubedge:only framework!=none -->
[Appwrite](https://appwrite.io) keeps the accounts, on Appwrite Cloud or your own server. Clients sign users in with Appwrite's SDK and send a JWT from it with each request (`Authorization: Bearer <token>`); the API checks it with Appwrite, and accepts only confirmed email addresses. <!-- clubedge:only framework=none -->

1. Create a project in [Appwrite Cloud](https://cloud.appwrite.io) (free tier) or on your Appwrite server.
2. Under Overview, Platforms, add a **Web** platform for the app's hostname: `localhost` in development, your domain in production. Appwrite only sends links to registered hostnames.
3. Under Overview, Integrations, API keys, create a key with the `sessions.write` and `users.write` scopes.
4. Set `APPWRITE_ENDPOINT` (such as `https://cloud.appwrite.io/v1`), `APPWRITE_PROJECT_ID`, and `APPWRITE_API_KEY`. The key stays on the server.

Changing or resetting a password signs out every other session; deleting an account removes the Appwrite user after the app's own data for them. A self-hosted Appwrite sends email only once its SMTP settings (`_APP_SMTP_HOST` and the rest) are set.

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

The database is on port 54322 and the API on port 54321, matching the example environment. Copy the publishable key from `pnpm infra:status` into the Supabase variables. Email confirmation is off locally, so sign-up signs the user in directly. `pnpm infra:down` stops the stack and `pnpm infra:reset` also deletes its data. <!-- clubedge:only framework!=none -->
The database is on port 54322, matching the example environment, and Supabase's API on port 54321. Copy that API URL and the publishable key from `pnpm infra:status` into the Supabase variables. Email confirmation is off locally, so sign-up signs the user in directly. `pnpm infra:down` stops the stack and `pnpm infra:reset` also deletes its data. <!-- clubedge:only framework=none -->

The app's own email goes to the same inbox over SMTP, on port 54325. <!-- clubedge:only email=smtp -->

<!-- clubedge:end -->
<!-- clubedge:if infra=local -->

This project runs its development services without Docker or any other installation:

- **PostgreSQL:** `pnpm dev` also starts [PGlite](https://pglite.dev), PostgreSQL compiled to WebAssembly, and serves it on `127.0.0.1:5433`. Each start applies the migrations. Data is kept in `.data/pglite`. `pnpm infra:up` runs the database on its own, for `pnpm check:services` or browser tests. <!-- clubedge:only framework!=none -->
- **PostgreSQL:** `pnpm dev` also starts [PGlite](https://pglite.dev), PostgreSQL compiled to WebAssembly, and serves it on `127.0.0.1:5433`. Each start applies the migrations. Data is kept in `.data/pglite`. `pnpm infra:up` runs the database on its own, for `pnpm check:services`. <!-- clubedge:only framework=none -->
- **Files:** while `STORAGE_DIRECTORY` is set, uploads are stored in that folder (`.data/storage`) instead of S3. Set the S3 variables and remove `STORAGE_DIRECTORY` to use object storage. <!-- clubedge:only storage=s3 -->
- **Cache:** without `REDIS_URL`, the cache and rate limits use process memory. <!-- clubedge:only cache=redis -->
- **Email:** without a provider configured, emails are printed to the `pnpm dev` output, links included. <!-- clubedge:only email!=none -->

PGlite runs a single database session, so connections take turns. That is plenty for development but not for production: deploy against a managed PostgreSQL by setting `DATABASE_URL`. Supabase Auth and Supabase Storage need a Supabase project, local or hosted. Better Auth works fully offline. `pnpm infra:reset` deletes everything in `.data/`.

<!-- clubedge:end -->
<!-- clubedge:if infra=neon -->

This project's database is hosted on [Neon](https://neon.com), so there is nothing to install or start:

- **PostgreSQL:** create-clubedge-app created a free, unclaimed Neon database and wrote `DATABASE_URL` (pooled) and `DATABASE_URL_DIRECT` into `apps/web/.env.local`. It expires 72 hours after creation and holds up to 100 MB until it is claimed. `pnpm clubedge neon` shows how long it has left. <!-- clubedge:only framework=next|tanstack-start -->
- **PostgreSQL:** create-clubedge-app created a free, unclaimed Neon database and wrote `DATABASE_URL` (pooled) and `DATABASE_URL_DIRECT` into `apps/api/.env.local`. It expires 72 hours after creation and holds up to 100 MB until it is claimed. `pnpm clubedge neon` shows how long it has left. <!-- clubedge:only framework=vite|none -->
- **Keep it:** `pnpm clubedge neon claim` opens Neon's claim page; sign in (free) and the database moves to your account with its data. Claiming resets the password, so copy the new connection strings from the Neon console into `apps/web/.env.local` afterwards: the pooled one into `DATABASE_URL`, the direct one into `DATABASE_URL_DIRECT`. <!-- clubedge:only framework=next|tanstack-start -->
- **Keep it:** `pnpm clubedge neon claim` opens Neon's claim page; sign in (free) and the database moves to your account with its data. Claiming resets the password, so copy the new connection strings from the Neon console into `apps/api/.env.local` afterwards: the pooled one into `DATABASE_URL`, the direct one into `DATABASE_URL_DIRECT`. <!-- clubedge:only framework=vite|none -->
- **Start over:** `pnpm clubedge neon create` creates a new database and replaces the two URLs, for example after one expired.
- **Your own project:** paste the connection strings from any Neon project instead; nothing else changes.
- **Cache:** without `REDIS_URL`, the cache and rate limits use process memory. <!-- clubedge:only cache=redis -->
- **Email:** without a provider configured, emails are printed to the `pnpm dev` output, links included. <!-- clubedge:only email!=none -->

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

<!-- clubedge:if infra=none|neon -->

### Pooled and direct connections

Hosted PostgreSQL usually offers two URLs. The pooled one (Neon's host ending in `-pooler`, Supabase's port 6543) runs each transaction on any free server connection, which suits the app's many short requests. Migrations and the background jobs worker need a whole session to themselves, which a transaction pooler can't give. Set `DATABASE_URL_DIRECT` to the direct URL, and `pnpm db:migrate`, Drizzle Kit, the production migrator, and the jobs worker use it; everything else stays on `DATABASE_URL`. Without it, they all use `DATABASE_URL`. `pnpm check:env` refuses a `DATABASE_URL_DIRECT` that points at Neon's pooler.

<!-- clubedge:end -->

`db:migrate` applies committed migrations. `db:push` is available for local development, but do not use it as a production migration workflow. Use `pnpm db:seed` only against a database where seed data is appropriate. The database commands run in `packages/db` and read `DATABASE_URL` from `apps/web/.env.local`, so the project keeps one environment file. The Postgres.js client is configured with `prepare: false` for compatibility with Supabase transaction pooling. <!-- clubedge:only framework!=none -->
`db:migrate` applies committed migrations. `db:push` is available for local development, but do not use it as a production migration workflow. Use `pnpm db:seed` only against a database where seed data is appropriate. The database commands run in `packages/db` and read `DATABASE_URL` from `apps/api/.env.local`, the API's environment file. The Postgres.js client is configured with `prepare: false` for compatibility with Supabase transaction pooling. <!-- clubedge:only framework=none -->

<!-- clubedge:if cache=redis -->

## Redis

Redis is optional. Set `REDIS_URL` to a TCP connection URL:

```dotenv
REDIS_URL=rediss://default:<password>@<host>:6379
```

Use `rediss://` for TLS connections such as Upstash and `redis://` for an unencrypted connection on a trusted network. The app uses the standard Redis protocol and requires a Node.js runtime with outbound TCP access. <!-- clubedge:only api!=fastapi -->
The API uses the standard Redis protocol and needs outbound TCP access. <!-- clubedge:only api=fastapi -->

Without `REDIS_URL`, the rate limiter and cache use process memory. Memory limits apply per server process, so configure Redis when you run several instances or serverless functions. Never commit a real Redis URL or password.

The API's rate limits use Redis, so `REDIS_URL` belongs in `apps/api/.env.local` and on the API's service. A limit answers `429` with `Retry-After`; when Redis is unreachable, requests go through and the failure is reported. <!-- clubedge:only api!=none -->

<!-- clubedge:end -->
<!-- clubedge:if cache=memory -->

## Cache and rate limits

The rate limiter and cache keep their state in process memory, which suits a single server instance. Limits and cached values are not shared between instances and reset on restart.

<!-- clubedge:end -->
<!-- clubedge:if email!=none -->

## Email

The app sends email through the `EmailProvider` in `apps/web/src/server/email.ts`. Server code imports `email` from `@/server/email` and calls `email.send({ to, subject, text, html })`. <!-- clubedge:only api=none -->
The API sends email through the `EmailProvider` in `apps/api/src/server/email.ts`: its code imports `email` from `@/server/email` and calls `email.send({ to, subject, text, html })`. <!-- clubedge:only api=hono -->
The API sends email through the `EmailProvider` in `apps/api/src/clubedge_api/email.py`: its code imports `email` from `clubedge_api.email` and awaits `email.send({"to": ..., "subject": ..., "text": ..., "html": ...})`. <!-- clubedge:only api=fastapi -->
Better Auth runs in the frontend's server (`apps/web/auth.server.mjs`), which sends its emails with the same provider, so set the email variables in both `apps/web/.env.local` and `apps/api/.env.local`. <!-- clubedge:only api!=none && auth=better-auth && framework!=none -->

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

The plans users can buy are in `apps/web/src/config/plans.ts`, with the app's own ids. The dashboard's billing card offers checkout for each plan, then shows the subscription and opens billing management. Server code reads a user's plan with `getBilling().subscriptionFor(userId)` and `isEntitled` from `@/server/payments`, and the `subscriptions` table keeps it in sync through the provider's webhook at `/api/webhooks/payments`. <!-- clubedge:only api=none -->
The plans users can buy are in `apps/api/src/config/plans.ts`, with the app's own ids, and the API serves them at `/api/billing`. The dashboard's billing card offers checkout for each plan, then shows the subscription and opens billing management; checkout and the portal send the user back to `FRONTEND_URL`. API code reads a user's plan with `getBilling().subscriptionFor(await getUserProfileId(user))` and `isEntitled` from `@/server/payments` and `@/server/users`, and the `subscriptions` table keeps it in sync through the provider's webhook at `/api/webhooks/payments`, which the frontend forwards to the API. <!-- clubedge:only api=hono -->
The plans users can buy are in `apps/api/src/clubedge_api/plans.py`, with the app's own ids, and the API serves them at `/api/billing`. The dashboard's billing card offers checkout for each plan, then shows the subscription and opens billing management; checkout and the portal send the user back to `FRONTEND_URL`. API code checks a user's plan with `has_active_subscription(await ensure_user_id(user))` from `clubedge_api.payments` and `clubedge_api.users`, or reads it with `find_subscription` and `is_entitled`. The `subscriptions` table keeps it in sync through the provider's webhook at `/api/webhooks/payments`, which the frontend forwards to the API; its tables and migrations are those of `packages/payments`, applied by `pnpm db:migrate` and by the image's `node migrate.mjs`. <!-- clubedge:only api=fastapi -->

<!-- clubedge:end -->
<!-- clubedge:if payments=stripe -->

[Stripe](https://stripe.com) runs checkout and billing management. In test mode: <!-- clubedge:only api=none -->
[Stripe](https://stripe.com) runs checkout and billing management. The Stripe variables go in `apps/api/.env.local`. In test mode: <!-- clubedge:only api!=none -->

1. Copy the secret key from the dashboard's API keys into `STRIPE_SECRET_KEY`.
2. Create a recurring price for each plan and put its id in `STRIPE_PRICE_<PLAN>`, such as `STRIPE_PRICE_PRO`.
3. Forward webhooks to your machine with the [Stripe CLI](https://docs.stripe.com/stripe-cli), and put the signing secret it prints in `STRIPE_WEBHOOK_SECRET`:

```sh
stripe listen --forward-to localhost:3000/api/webhooks/payments
```

The Stripe CLI posts to the frontend on port 3000, which forwards the webhook, body untouched, to the API; the API itself stays private. <!-- clubedge:only api!=none -->

Turn on the customer portal in the dashboard's billing settings, so "Manage billing" works. In production, add a webhook endpoint for `https://<your-domain>/api/webhooks/payments` with the events `checkout.session.completed` and `customer.subscription.created`, `.updated`, `.deleted`, `.paused`, and `.resumed`, and use its signing secret. Every webhook's signature is verified, each event is applied once, and subscription events read the subscription's current state from Stripe, so retried or out-of-order deliveries are safe.

<!-- clubedge:end -->
<!-- clubedge:if payments!=none -->

Payments go through the provider-neutral `PaymentProvider` interface in `packages/payments`. To use another provider, implement that interface in a new package and return it from `apps/web/src/server/payments.ts`; billing logic, the tables, the routes, and the billing card stay the same. <!-- clubedge:only api=none -->
Payments go through the provider-neutral `PaymentProvider` interface in `packages/payments`. To use another provider, implement that interface in a new package and return it from `apps/api/src/server/payments.ts`; billing logic, the tables, the routes, and the billing card stay the same. <!-- clubedge:only api=hono -->
Payments go through the provider-neutral `PaymentProvider` protocol in `apps/api/src/clubedge_api/payments.py`, which follows `packages/payments` and reads and writes the same tables. To use another provider, implement that protocol in a new module and build its `Billing` in place of `stripe_billing` (`apps/api/src/clubedge_api/payments_stripe.py`); billing logic, the tables, the routes, and the billing card stay the same. <!-- clubedge:only api=fastapi -->

<!-- clubedge:end -->
<!-- clubedge:if jobs!=none -->

## Background jobs

Jobs run outside requests, with retries, in a worker that starts inside the app server: `pnpm dev` and the production server both run it, so there is no separate process to deploy. [pg-boss](https://github.com/timgit/pg-boss) stores them in your PostgreSQL, and creates and upgrades its own tables in the `pgboss` schema when the app starts. <!-- clubedge:only jobs=pg-boss && api=none -->
Jobs run outside requests, with retries, in a worker that starts inside the API: `pnpm dev` and the API's production server both run it, so there is no separate process to deploy. [pg-boss](https://github.com/timgit/pg-boss) stores them in your PostgreSQL, and creates and upgrades its own tables in the `pgboss` schema when the API starts. <!-- clubedge:only jobs=pg-boss && api=hono -->
Jobs run outside requests, with retries, in a worker that starts inside the app server: `pnpm dev` and the production server both run it, so there is no separate process to deploy. [BullMQ](https://docs.bullmq.io) stores them in Redis (`REDIS_URL`, Redis 6.2 or newer), which the cache also uses; keep it on a Redis that doesn't evict keys, since jobs are data. <!-- clubedge:only jobs=bullmq && api=none -->
Jobs run outside requests, with retries, in a worker that starts inside the API: `pnpm dev` and the API's production server both run it, so there is no separate process to deploy. [BullMQ](https://docs.bullmq.io) stores them in Redis (`REDIS_URL` in `apps/api/.env.local`, Redis 6.2 or newer), which the cache also uses; keep it on a Redis that doesn't evict keys, since jobs are data. <!-- clubedge:only jobs=bullmq && api=hono|fastapi -->
[Inngest](https://www.inngest.com) runs the jobs: the app sends an event for each one, and Inngest calls the app's `/api/inngest` to run it, with retries and schedules, so nothing runs between requests and serverless hosts need no cron. In development, start Inngest's Dev Server next to `pnpm dev` with `pnpm jobs:dev`, and open its dashboard at <http://localhost:8288> to see every run; `INNGEST_DEV=1` points the app at it. In production, create an app in Inngest, set `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY`, remove `INNGEST_DEV`, and sync the deployed `/api/inngest` URL in Inngest's dashboard (Inngest's Vercel and Netlify integrations do it on each deploy). <!-- clubedge:only jobs=inngest && api=none -->
[Inngest](https://www.inngest.com) runs the jobs: the API sends an event for each one, and Inngest calls `/api/inngest` to run it, with retries and schedules. Inngest reaches the API through the frontend, which forwards `/api/inngest` to it, so the API stays private; the API tells Inngest its address from `FRONTEND_URL`. In development, start Inngest's Dev Server next to `pnpm dev` with `pnpm jobs:dev`, and open its dashboard at <http://localhost:8288> to see every run; `INNGEST_DEV=1` in `apps/api/.env.local` points the API at it, and the API syncs its jobs once the frontend answers. In production, create an app in Inngest, set `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` on the API, remove `INNGEST_DEV`, and sync `https://<your-frontend>/api/inngest` in Inngest's dashboard. <!-- clubedge:only jobs=inngest && api=hono|fastapi -->

Define a job in `apps/web/src/jobs` and add it to the list in `apps/web/src/jobs/index.ts`: <!-- clubedge:only api=none -->
Define a job in `apps/api/src/jobs` and add it to the list in `apps/api/src/jobs/index.ts`: <!-- clubedge:only api=hono -->
Define a job in `apps/api/src/clubedge_api/jobs.py` and add it to `JOBS` there: <!-- clubedge:only api=fastapi -->

<!-- clubedge:end -->
<!-- clubedge:if jobs!=none && api!=fastapi -->

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

<!-- clubedge:end -->
<!-- clubedge:if jobs!=none && api=fastapi -->

```python
async def _welcome_email(data: JobData, context: JobContext) -> None:
    # Look the user up by data["userId"] and send the email.
    ...

welcome_email = JobDefinition(name="welcome-email", run=_welcome_email, retry_limit=3)
```

<!-- clubedge:end -->
<!-- clubedge:if jobs!=none -->

Queue it from server code with `getJobs().enqueue(welcomeEmail, { userId })`, from `@/server/jobs`. To send any email in the background, enqueue `sendEmailJob` from `@/jobs` with the message, as the auth emails do. <!-- clubedge:only email!=none && api=none -->
Queue it from the API's code with `getJobs().enqueue(welcomeEmail, { userId })`, from `@/server/jobs`. To send any email in the background, enqueue `sendEmailJob` from `@/jobs` with the message. <!-- clubedge:only email!=none && api=hono -->
Queue it from server code with `getJobs().enqueue(welcomeEmail, { userId })`, from `@/server/jobs`. <!-- clubedge:only email=none && api=none -->
Queue it from the API's code with `getJobs().enqueue(welcomeEmail, { userId })`, from `@/server/jobs`. <!-- clubedge:only email=none && api=hono -->
Queue it from the API's code with `await get_jobs().enqueue(welcome_email, {"userId": user_id})`, from `clubedge_api.background_jobs`. To send any email in the background, enqueue `send_email_job` from `clubedge_api.jobs` with the message. <!-- clubedge:only email!=none && api=fastapi -->
Queue it from the API's code with `await get_jobs().enqueue(welcome_email, {"userId": user_id})`, from `clubedge_api.background_jobs`. <!-- clubedge:only email=none && api=fastapi -->

A thrown error fails the attempt and the job is retried (`retryLimit`, `retryDelaySeconds`, `retryBackoff`). An attempt that runs past `timeoutSeconds`, or whose server stops, is retried too, so make jobs safe to run twice. Add `schedule: "0 3 * * *"` (cron syntax, UTC) to run a job on a schedule. Restart `pnpm dev` after adding or changing a job. The dashboard's jobs card queues the sample job from `apps/web/src/jobs/sample.ts` and lists its recent runs; remove both when you add your own. <!-- clubedge:only api=none -->
A thrown error fails the attempt and the job is retried (`retryLimit`, `retryDelaySeconds`, `retryBackoff`). An attempt that runs past `timeoutSeconds`, or whose server stops, is retried too, so make jobs safe to run twice. Add `schedule: "0 3 * * *"` (cron syntax, UTC) to run a job on a schedule. Restart the API after adding or changing a job. The dashboard's jobs card queues the sample job from `apps/api/src/jobs/sample.ts` through `/api/jobs` and lists its recent runs; remove both when you add your own. <!-- clubedge:only api=hono && framework!=none -->
A thrown error fails the attempt and the job is retried (`retryLimit`, `retryDelaySeconds`, `retryBackoff`). An attempt that runs past `timeoutSeconds`, or whose server stops, is retried too, so make jobs safe to run twice. Add `schedule: "0 3 * * *"` (cron syntax, UTC) to run a job on a schedule. Restart the API after adding or changing a job. `POST /api/jobs/sample` queues the sample job from `apps/api/src/jobs/sample.ts`, and `GET /api/jobs` lists its recent runs; remove them when you add your own. <!-- clubedge:only api=hono && framework=none -->
A raised exception fails the attempt and the job is retried (`retry_limit`, `retry_delay_seconds`, `retry_backoff`). An attempt that runs past `timeout_seconds`, or whose server stops, is retried too, so make jobs safe to run twice. Add `schedule="0 3 * * *"` (cron syntax, UTC) to run a job on a schedule. Restart the API after adding or changing a job. The dashboard's jobs card queues `sample_job` from `apps/api/src/clubedge_api/jobs.py` through `/api/jobs` and lists its recent runs; remove both when you add your own. <!-- clubedge:only api=fastapi && framework!=none -->
A raised exception fails the attempt and the job is retried (`retry_limit`, `retry_delay_seconds`, `retry_backoff`). An attempt that runs past `timeout_seconds`, or whose server stops, is retried too, so make jobs safe to run twice. Add `schedule="0 3 * * *"` (cron syntax, UTC) to run a job on a schedule. Restart the API after adding or changing a job. `POST /api/jobs/sample` queues `sample_job` from `apps/api/src/clubedge_api/jobs.py`, and `GET /api/jobs` lists its recent runs; remove them when you add your own. <!-- clubedge:only api=fastapi && framework=none -->

Where no server keeps running, as on Vercel and Netlify, there is no worker: `JOBS_WORKER` defaults to `off` there, and you can set it yourself anywhere. Set `CRON_SECRET` to 16 or more random characters and call `GET /api/jobs/run` every minute or so with the header `Authorization: Bearer <CRON_SECRET>`, from Vercel Cron, a Netlify scheduled function, or any scheduler. Each call runs the jobs that are due. <!-- clubedge:only jobs=pg-boss|bullmq && api=none -->
To run the jobs elsewhere, set `JOBS_WORKER=off` on the API: it then runs no worker. Set `CRON_SECRET` to 16 or more random characters and call `GET /api/jobs/run` on the frontend, which forwards it to the API, every minute or so with the header `Authorization: Bearer <CRON_SECRET>`. Each call runs the jobs that are due. The API stops its worker on `SIGTERM`, letting running jobs finish. <!-- clubedge:only jobs=pg-boss|bullmq && api=hono|fastapi && framework!=none -->
To run the jobs elsewhere, set `JOBS_WORKER=off` on the API: it then runs no worker. Set `CRON_SECRET` to 16 or more random characters and call the API's `GET /api/jobs/run` every minute or so with the header `Authorization: Bearer <CRON_SECRET>`. Each call runs the jobs that are due. The API stops its worker on `SIGTERM`, letting running jobs finish. <!-- clubedge:only jobs=pg-boss|bullmq && framework=none -->
Inngest keeps the job history: the jobs card reads it from Inngest's API (the Dev Server's locally), and Inngest's dashboard shows each run's attempts, output, and errors. <!-- clubedge:only jobs=inngest -->

Jobs go through the provider-neutral `JobQueue` interface in `packages/jobs`, so job definitions, the routes, and the jobs card stay the same whichever provider runs them. Switch providers with `pnpm clubedge add jobs pg-boss`, `bullmq`, or `inngest`. To add another, implement `JobQueue` in a new package, return it from `apps/web/src/server/jobs.ts`, and prove it with the shared conformance suite, as each provider's tests do: <!-- clubedge:only api=none -->
Jobs go through the provider-neutral `JobQueue` interface in `packages/jobs`, so job definitions, the routes, and the jobs card stay the same whichever provider runs them. Switch providers with `pnpm clubedge add jobs pg-boss`, `bullmq`, or `inngest`. To add another, implement `JobQueue` in a new package, return it from `apps/api/src/server/jobs.ts`, and prove it with the shared conformance suite, as each provider's tests do: <!-- clubedge:only api=hono && framework!=none -->
Jobs go through the provider-neutral `JobQueue` interface in `packages/jobs`, so job definitions and the routes stay the same whichever provider runs them. Switch providers with `pnpm clubedge add jobs pg-boss` or `bullmq`. To add another, implement `JobQueue` in a new package, return it from `apps/api/src/server/jobs.ts`, and prove it with the shared conformance suite, as each provider's tests do: <!-- clubedge:only api=hono && framework=none -->
Jobs go through the provider-neutral `JobQueue` protocol in `apps/api/src/clubedge_api/job_queue.py`, so job definitions, the routes, and the jobs card stay the same whichever provider runs them. Switch providers with `pnpm clubedge add jobs bullmq` or `inngest`; pg-boss, which the TypeScript stacks offer, is not available with the FastAPI API. To add another, implement `JobQueue` in a new module and return it from `apps/api/src/clubedge_api/background_jobs.py`. <!-- clubedge:only api=fastapi && framework!=none -->
Jobs go through the provider-neutral `JobQueue` protocol in `apps/api/src/clubedge_api/job_queue.py`, so job definitions and the routes stay the same whichever provider runs them. Without a website, BullMQ is the one provider the FastAPI API offers; to add another, implement `JobQueue` in a new module and return it from `apps/api/src/clubedge_api/background_jobs.py`. <!-- clubedge:only api=fastapi && framework=none -->

<!-- clubedge:end -->
<!-- clubedge:if jobs!=none && api!=fastapi -->

```ts
import { describeJobQueue } from "@clubedge/jobs/conformance";

describeJobQueue("my-queue", (jobs, { worker }) => createMyQueue({ jobs, worker }));
```

<!-- clubedge:end -->
<!-- clubedge:if observability!=none -->

## Observability

Server errors and traces go to the tool you chose. Errors that escape a page, route, server action, or server function are sent with the request's method and path, and so are errors the app handles and reports with `reportError` from `@clubedge/core`, such as a failed webhook, email, or background job. Every request is traced, and so are calls through the email, storage, and payments composition roots, as spans such as `email.send` and `storage.upload`. Wrap your own work with `traced("name", () => work())` from `@clubedge/core`. Until the tool is configured nothing is sent, and errors keep going to the server log. <!-- clubedge:only framework!=none -->
Server errors and traces go to the tool you chose. Errors that escape an API route are sent with the request's method and path, and so are errors the API handles and reports with `reportError` from `@clubedge/core`. Every request is traced; wrap your own work with `traced("name", () => work())` from `@clubedge/core`. Until the tool is configured nothing is sent, and errors keep going to the server log. <!-- clubedge:only framework=none && api=hono -->
Server errors and traces go to the tool you chose. Errors that escape an API route are sent with the request's method and path, and every request is traced. Until the tool is configured nothing is sent, and errors keep going to the server log. <!-- clubedge:only framework=none && api=fastapi -->

<!-- clubedge:end -->
<!-- clubedge:if observability=otel -->

Set `OTEL_EXPORTER_OTLP_ENDPOINT` to an OpenTelemetry collector or to a vendor's OTLP/HTTP endpoint (Grafana Cloud, Honeycomb, Datadog, and others accept it), with any API key in `OTEL_EXPORTER_OTLP_HEADERS` as `key=value` pairs. Traces go to `/v1/traces` and errors to `/v1/logs` as error log records, and each error is also recorded on the span it happened in. `OTEL_SERVICE_NAME` defaults to the project's service id. The spans Next.js and pg-boss create join the same traces. <!-- clubedge:only framework=next -->
Set `OTEL_EXPORTER_OTLP_ENDPOINT` to an OpenTelemetry collector or to a vendor's OTLP/HTTP endpoint (Grafana Cloud, Honeycomb, Datadog, and others accept it), with any API key in `OTEL_EXPORTER_OTLP_HEADERS` as `key=value` pairs. Traces go to `/v1/traces` and errors to `/v1/logs` as error log records, and each error is also recorded on the span it happened in. `OTEL_SERVICE_NAME` defaults to the project's service id. <!-- clubedge:only framework=tanstack-start -->
Set `OTEL_EXPORTER_OTLP_ENDPOINT` in `apps/api/.env.local` to an OpenTelemetry collector or to a vendor's OTLP/HTTP endpoint (Grafana Cloud, Honeycomb, Datadog, and others accept it), with any API key in `OTEL_EXPORTER_OTLP_HEADERS` as `key=value` pairs. The API sends traces to `/v1/traces` and errors to `/v1/logs` as error log records, and each error is also recorded on the span it happened in. `OTEL_SERVICE_NAME` defaults to the API's service id. <!-- clubedge:only framework=vite|none -->

To see traces during development, run [Jaeger](https://www.jaegertracing.io), set `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318`, and open http://localhost:16686:

```sh
docker run --rm -p 16686:16686 -p 4318:4318 jaegertracing/jaeger:latest
```

<!-- clubedge:end -->
<!-- clubedge:if observability=sentry -->

Create a Node.js project in [Sentry](https://sentry.io) and set `SENTRY_DSN` to its DSN. `SENTRY_TRACES_SAMPLE_RATE` is the share of requests traced, from 0 to 1 (default 0.1; use 1 while trying it out), and `SENTRY_ENVIRONMENT` labels events (default `NODE_ENV`). The SDK sends no user details, cookies, query strings, or request bodies. The spans Next.js and pg-boss create join the same traces. <!-- clubedge:only framework=next -->
Create a Node.js project in [Sentry](https://sentry.io) and set `SENTRY_DSN` to its DSN. `SENTRY_TRACES_SAMPLE_RATE` is the share of requests traced, from 0 to 1 (default 0.1; use 1 while trying it out), and `SENTRY_ENVIRONMENT` labels events (default `NODE_ENV`). The SDK sends no user details, cookies, query strings, or request bodies. <!-- clubedge:only framework=tanstack-start -->
Create a Node.js project in [Sentry](https://sentry.io) and set `SENTRY_DSN` in `apps/api/.env.local` to its DSN; the frontend reads it from the API at runtime. `SENTRY_TRACES_SAMPLE_RATE` is the share of API requests traced, from 0 to 1 (default 0.1; use 1 while trying it out), and `SENTRY_ENVIRONMENT` labels events (default `NODE_ENV`). The SDK sends no user details, cookies, query strings, or request bodies. <!-- clubedge:only framework=vite && api=hono -->
Create a Node.js project in [Sentry](https://sentry.io) and set `SENTRY_DSN` in `apps/api/.env.local` to its DSN. `SENTRY_TRACES_SAMPLE_RATE` is the share of API requests traced, from 0 to 1 (default 0.1; use 1 while trying it out), and `SENTRY_ENVIRONMENT` labels events (default `NODE_ENV`). The SDK sends no user details, cookies, query strings, or request bodies. <!-- clubedge:only framework=none && api=hono -->
Create a Python project in [Sentry](https://sentry.io) and set `SENTRY_DSN` in `apps/api/.env.local` to its DSN; the frontend reads it from the API at runtime. `SENTRY_TRACES_SAMPLE_RATE` is the share of API requests traced, from 0 to 1 (default 0.1; use 1 while trying it out), and `SENTRY_ENVIRONMENT` labels events (default `NODE_ENV`). The SDK sends no user details, cookies, query strings, or request bodies, and its integrations trace what FastAPI, httpx, and Redis do in the same traces. <!-- clubedge:only api=fastapi && framework!=none -->
Create a Python project in [Sentry](https://sentry.io) and set `SENTRY_DSN` in `apps/api/.env.local` to its DSN. `SENTRY_TRACES_SAMPLE_RATE` is the share of API requests traced, from 0 to 1 (default 0.1; use 1 while trying it out), and `SENTRY_ENVIRONMENT` labels events (default `NODE_ENV`). The SDK sends no user details, cookies, query strings, or request bodies, and its integrations trace what FastAPI, httpx, and Redis do in the same traces. <!-- clubedge:only api=fastapi && framework=none -->

To see your own code in browser stack traces, give the build `SENTRY_AUTH_TOKEN` (an auth token with the `project:releases` scope), `SENTRY_ORG`, and `SENTRY_PROJECT`. The build then makes source maps for the browser bundle, uploads them to Sentry, and deletes them, so they are never served. Without the token the build makes no source maps. Set the three variables where the build runs: in CI, or as build-time variables on your platform. <!-- clubedge:only framework=next|tanstack-start -->
The React + Vite build does not upload source maps to Sentry yet, so browser stack traces point into the minified bundle. <!-- clubedge:only framework=vite -->

<!-- clubedge:end -->
<!-- clubedge:if observability!=none -->

Uncaught errors in the browser are reported too, with the page's path and no query string. With OpenTelemetry, the browser sends them to `/api/client-errors`, which reports them like server errors and accepts 30 reports a minute per address. With Sentry, Sentry's browser SDK sends them directly; it is downloaded only when `SENTRY_DSN` is set. In both cases the browser reads its settings from `/api/client-errors` at runtime, so builds never bake them in. <!-- clubedge:only framework!=none -->

On Vercel and Netlify, a function can stop right after it responds, so spans still waiting in a batch at that moment can be lost. <!-- clubedge:only framework=next|tanstack-start -->

Observability goes through the provider-neutral `ObservabilityProvider` interface in `packages/observability` and the telemetry hooks in `@clubedge/core`. To use another tool, implement that interface in a new package and install it from `apps/web/src/server/observability.ts`; error reports and spans across the app stay the same. <!-- clubedge:only api=none -->
Observability goes through the provider-neutral `ObservabilityProvider` interface in `packages/observability` and the telemetry hooks in `@clubedge/core`. To use another tool, implement that interface in a new package and install it from `apps/api/src/server/observability.ts`; error reports and spans across the API stay the same. The API stops taking requests on `SIGTERM` and sends what is still buffered before it exits. <!-- clubedge:only api=hono -->
Observability goes through the `Observability` protocol in `apps/api/src/clubedge_api/telemetry.py`: each API request is traced (`tracing.py`), and every error the API logs at the `ERROR` level, such as with `logger.exception(...)`, reaches the provider, with the `extra` it was logged with as its attributes. To use another tool, implement that protocol and start it from `apps/api/src/clubedge_api/observability.py`; error reports and spans across the API stay the same. The API stops taking requests on `SIGTERM` and sends what is still buffered before it exits. <!-- clubedge:only api=fastapi -->

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
<!-- clubedge:if storage!=none && api=hono -->

The API holds the storage adapter: set its variables in `apps/api/.env.local`, and in a route call `getStorage(c.req.raw)` from `apps/api/src/server/storage.ts`. `pnpm check:services` uploads, reads back, and deletes a test file. <!-- clubedge:only storage=s3 -->
The API holds the storage adapter: set `SUPABASE_STORAGE_BUCKET` in `apps/api/.env.local`, and in a route call `getStorage(c.req.raw)` from `apps/api/src/server/storage.ts`. It acts as the user whose Supabase access token the request carries (its `Authorization: Bearer` header), and as anonymous without one. <!-- clubedge:only storage=supabase -->

<!-- clubedge:end -->
<!-- clubedge:if storage!=none && api=fastapi -->

The API holds the storage adapter: set its variables in `apps/api/.env.local`, and in a route call `get_storage(request)` from `apps/api/src/clubedge_api/storage.py`, then await its `upload`, `download`, `delete`, `exists`, or `get_signed_url`. `pnpm check:services` uploads, reads back, and deletes a test file. <!-- clubedge:only storage=s3 -->
The API holds the storage adapter: set `SUPABASE_STORAGE_BUCKET` in `apps/api/.env.local`, and in a route call `get_storage(request)` from `apps/api/src/clubedge_api/storage.py`, then await its `upload`, `download`, `delete`, `exists`, or `get_signed_url`. It acts as the user whose Supabase access token the request carries (its `Authorization: Bearer` header), and as anonymous without one. <!-- clubedge:only storage=supabase -->

<!-- clubedge:end -->
<!-- clubedge:if storage!=none -->

The storage adapter does not authorize users or validate uploads. Before calling it, the route must check ownership and authorization, file size, content type, and the object key. Keep credentials server side.

<!-- clubedge:end -->
<!-- clubedge:if framework!=none -->

## Shared UI development

The app's `components.json` and `packages/ui/components.json` direct the shadcn CLI into the shared `packages/ui` package. The selected `base-nova` style uses `@base-ui/react` primitives, not Radix UI. Tailwind CSS 4 and semantic theme tokens are defined in `packages/ui/src/styles/globals.css` and imported by the app's root route.

Generate a shared component from the repository root:

```sh
pnpm dlx shadcn@latest add badge -c apps/web
```

Shared components live in `packages/ui/src/components` and are imported from `@clubedge/ui/components/<component>`. Keep both `components.json` files aligned when changing the shadcn style, Tailwind CSS entry, base color, icon library, or RTL setting. The `rtl` setting makes newly generated components RTL-aware; set `lang` and `dir` on the root `<html>` element to match your application's actual locale. App-specific components belong in `apps/web/src/components`.

The root route is a public landing page; the reference dashboard is available at `/dashboard`. The dashboard uses the shared shadcn sidebar and breadcrumb. A light/dark switch is available in the landing page and dashboard navigation; its choice is saved in local storage and the initial theme follows the system preference until the user selects one. Theme colors are centralized in `packages/ui/src/styles/globals.css` (blue `#2563eb`, dark background `#151515`).

<!-- clubedge:end -->

## Docker

<!-- clubedge:if framework!=none -->

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

<!-- clubedge:end -->
<!-- clubedge:if framework=none -->

Create `apps/api/.env.local` first. `pnpm docker:dev` builds the API's image and runs it with Docker Compose (`docker-compose.yml`), publishing port 3001:

```sh
pnpm docker:dev
```

Build a production image from the repository root and run it with:

```sh
docker build -f apps/api/Dockerfile -t <image> .
docker run --rm -p 3001:3001 --env-file apps/api/.env.local <image>
```

The image runs the API as an unprivileged user. Ensure the configured database and provider hosts are reachable from the container.

<!-- clubedge:end -->

The image also contains the production migrator, which applies every package's migrations with only `DATABASE_URL`:

```sh
docker run --rm --env DATABASE_URL="postgresql://..." <image> node /app/migrate.mjs
```

Run it before a new version starts serving; it skips migrations that are already applied.

## Deploy

<!-- clubedge:if deploy=docker -->

Run the production image on any host or orchestrator that runs containers: build it with `pnpm docker:build` or in CI, push it to a registry, and start it with the production environment. Before each release, run the migrator above as a one-off task (a Kubernetes Job, an ECS task, or `docker run`), then roll out the new containers. Point the platform's health check at `/api/health`. <!-- clubedge:only framework!=none -->
Run the API's production image on any host or orchestrator that runs containers: build it as above or in CI, push it to a registry, and start it with the production environment. Before each release, run the migrator above as a one-off task (a Kubernetes Job, an ECS task, or `docker run`), then roll out the new containers. Point the platform's health check at `/api/health`. <!-- clubedge:only framework=none -->

On a server of your own, `pnpm clubedge deploy` sets this up with Docker Compose. It writes three files, and never overwrites one you changed:

- `compose.yaml` runs the app's image behind [Caddy](https://caddyserver.com), the only service that publishes ports: Caddy serves your domain over HTTPS, with certificates it obtains and renews by itself. <!-- clubedge:only api=none -->
- `compose.yaml` runs the frontend's and the API's images behind [Caddy](https://caddyserver.com), the only service that publishes ports: Caddy serves your domain over HTTPS, with certificates it obtains and renews by itself, and the API stays on the Compose network behind the frontend. <!-- clubedge:only api!=none && framework!=none -->
- `compose.yaml` runs the API's image behind [Caddy](https://caddyserver.com), the only service that publishes ports: Caddy serves your domain over HTTPS, with certificates it obtains and renews by itself, and passes the client's address to the API. <!-- clubedge:only framework=none -->
- `Caddyfile` is Caddy's configuration.
- `.github/workflows/release-images.yml` builds the images for linux/amd64 and linux/arm64 on each published GitHub release, and publishes them to this repository's GitHub Container Registry, tagged with the version, `<major>.<minor>`, and `latest`.

It then prints the remaining steps: `DOMAIN` and the production variables in `.env.production`, the domain's DNS records, a release, the migrator, and `docker compose --env-file .env.production up -d`.

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

`.railway/railway.ts` is the service's configuration on [Railway](https://railway.com), as code: Railway builds the root `Dockerfile`, runs `node /app/migrate.mjs` before each release, so a failed migration stops it, and checks `/api/health` before switching traffic. <!-- clubedge:only framework!=none -->
`.railway/railway.ts` is the API's configuration on [Railway](https://railway.com), as code: `pnpm clubedge deploy` writes it so that Railway builds `apps/api/Dockerfile`, runs `node /app/migrate.mjs` before each release, so a failed migration stops it, and checks `/api/health` before switching traffic. <!-- clubedge:only framework=none -->

The quickest first deploy is `pnpm clubedge deploy`: it creates the project, Postgres, the service, its domain and variables, applies `.railway/railway.ts`, and deploys. To deploy another way, add Railway's TypeScript SDK with `pnpm add -D -w railway`, run `railway config apply` once (Railway CLI 5.42.1 or newer), and add the production variables listed below to the service. The file names the service after the package; if yours has another name, change it there. <!-- clubedge:only framework!=none -->
The first deploy is `pnpm clubedge deploy`: it creates the project, Postgres, the API's service, its public `*.up.railway.app` domain and its variables, writes and applies `.railway/railway.ts`, and deploys. The API is the project's one public service. <!-- clubedge:only framework=none -->

<!-- clubedge:end -->
<!-- clubedge:if deploy=render -->

`render.yaml` is a [Render](https://render.com) Blueprint: in the dashboard, choose New, then Blueprint, and select this repository. Render asks for each variable marked `sync: false` and generates `BETTER_AUTH_SECRET`. <!-- clubedge:only auth=better-auth -->
`render.yaml` is a [Render](https://render.com) Blueprint: in the dashboard, choose New, then Blueprint, and select this repository. Render asks for each variable marked `sync: false`. <!-- clubedge:only auth!=better-auth -->

Render runs `node /app/migrate.mjs` as the pre-deploy command before each deploy goes live, and a failed migration stops the deploy. Pre-deploy commands need a paid instance type. On the free type, remove `preDeployCommand` from `render.yaml` and apply migrations yourself before deploying, from your machine or CI, with `DATABASE_URL` set to the production database: `pnpm db:migrate`, or the migrator in the image as shown above. Health checks call `/api/health`.

<!-- clubedge:end -->
<!-- clubedge:if deploy=vercel -->

`apps/web/vercel.json` deploys the app to [Vercel](https://vercel.com). Import the repository, set the project's Root Directory to `apps/web`, add the production variables listed below, and deploy. Vercel installs the whole pnpm workspace and builds the app. <!-- clubedge:only framework=next -->
`apps/web/vercel.json` deploys the app to [Vercel](https://vercel.com). Import the repository, set the project's Root Directory to `apps/web`, add the production variables listed below, and deploy. The build detects Vercel and writes Vercel's Build Output, with server routes as functions. <!-- clubedge:only framework=tanstack-start -->

Vercel only runs the app: the database, Redis, file storage, and email come from your providers (for example Supabase, Upstash, and Cloudflare R2). The build command starts with `pnpm check:env`, which stops the build when a variable the project's modules need is unset, or points at `localhost`, and lists each one. Set them for every environment you deploy (Production and Preview); `SKIP_ENV_CHECK=1` builds anyway.

Vercel has no step that runs before a release, so the build command applies migrations (`pnpm db:migrate`) against the `DATABASE_URL` of the deployment's environment. Give Preview deployments their own database, or remove the migration step from `buildCommand` and run migrations yourself. Serverless functions open a connection per instance: use your provider's pooled connection URL (for example Supabase's transaction pooler or Neon's pooled endpoint).

Vercel runs no worker for [background jobs](#background-jobs). Set `CRON_SECRET` and add `"crons": [{ "path": "/api/jobs/run", "schedule": "* * * * *" }]` to `vercel.json`; Vercel Cron sends the secret itself. Cron jobs more frequent than daily need a paid Vercel plan; otherwise call the endpoint from another scheduler. <!-- clubedge:only jobs=pg-boss|bullmq -->

<!-- clubedge:end -->
<!-- clubedge:if deploy=netlify -->

`apps/web/netlify.toml` deploys the app to [Netlify](https://www.netlify.com). Import the repository, set the site's Base directory to `apps/web`, add the production variables listed below, and deploy. Netlify installs its Next.js runtime automatically. <!-- clubedge:only framework=next -->
`apps/web/netlify.toml` deploys the app to [Netlify](https://www.netlify.com). Import the repository, set the site's Base directory to `apps/web`, add the production variables listed below, and deploy. The build detects Netlify and writes its functions and static assets. <!-- clubedge:only framework=tanstack-start -->

Netlify only runs the app: the database, Redis, file storage, and email come from your providers (for example Supabase, Upstash, and Cloudflare R2). The build command starts with `pnpm check:env`, which stops the build when a variable the project's modules need is unset, or points at `localhost`, and lists each one. Set them for every deploy context you build (production and deploy previews); `SKIP_ENV_CHECK=1` builds anyway.

Netlify has no step that runs before a release, so the build command applies migrations (`pnpm db:migrate`) against the `DATABASE_URL` of the deploy context. Give deploy previews their own database, or remove the migration step from the build command and run migrations yourself. Serverless functions open a connection per instance: use your provider's pooled connection URL (for example Supabase's transaction pooler or Neon's pooled endpoint).

Netlify runs no worker for [background jobs](#background-jobs). Set `JOBS_WORKER=off` and `CRON_SECRET`, then call `/api/jobs/run` every minute from a [scheduled function](https://docs.netlify.com/build/functions/scheduled-functions/) or another scheduler, with the header `Authorization: Bearer <CRON_SECRET>`. <!-- clubedge:only jobs=pg-boss|bullmq -->

<!-- clubedge:end -->

<!-- clubedge:if deploy!=docker -->

`.github/workflows/deploy.yml` deploys on demand: in GitHub, open Actions, then Deploy, then Run workflow.

- It needs the secret `FLY_API_TOKEN`, from `fly tokens create deploy`. <!-- clubedge:only deploy=fly -->
- It needs the secret `RAILWAY_TOKEN`, a project token from the project's settings, and the variable `RAILWAY_SERVICE`, the service's name. <!-- clubedge:only deploy=railway -->
- It needs the secret `RENDER_DEPLOY_HOOK_URL`, the deploy hook from the service's settings. <!-- clubedge:only deploy=render -->
- It needs the secrets `VERCEL_TOKEN`, from your account settings, and `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`, which `vercel link` writes to `.vercel/project.json`. <!-- clubedge:only deploy=vercel -->
- It needs the secrets `NETLIFY_AUTH_TOKEN`, a personal access token, and `NETLIFY_SITE_ID`, from the site's settings. <!-- clubedge:only deploy=netlify -->

<!-- clubedge:end -->

<!-- clubedge:if infra=neon -->

### Preview environments

`.github/workflows/preview.yml` gives each pull request its own database: a [Neon branch](https://neon.com/docs/introduction/branching) named `preview/pr-<number>`, a copy of the production branch made in seconds that shares its storage until it changes. It applies the pull request's migrations to the branch, comments the schema diff on the pull request, deploys a preview against it, and deletes the branch when the pull request closes. Pull requests from forks get no preview, since GitHub gives them no secrets.

It runs once the repository has the Neon settings below, in Settings, then Secrets and variables, then Actions; each deploy step waits for its own platform's token, so a pull request gets its branch, migrations, and schema diff with the Neon settings alone:

- the secret `NEON_API_KEY`, from the Neon console's account or organization settings, and the variable `NEON_PROJECT_ID`, from the project's settings. A free database the CLI created must be claimed first.
- the secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID`, as for the deploy workflow. The preview is a Vercel preview deployment with the project's Preview variables, except `DATABASE_URL` and `DATABASE_URL_DIRECT`, which point at the branch. <!-- clubedge:only deploy=vercel -->
- the secret `RAILWAY_API_TOKEN`, an account or workspace token (a project token can't create environments), and the variables `RAILWAY_PROJECT_ID` and `RAILWAY_SERVICE`. Each pull request gets a Railway environment, `pr-<number>`, copied from production with its own domain and the branch as its database; it is deleted with the branch. <!-- clubedge:only deploy=railway -->

The Starter repository also runs `.github/workflows/stack-previews.yml`. For each pull request, it generates React + Vite with Hono and FastAPI through the CLI, then deploys each generated frontend and API as separate Render web services. Both stacks use the existing main Supabase project's Auth endpoint and publishable key, retrieved by the workflow and passed to their generated frontend and API. Set the Actions secret `SUPABASE_ACCESS_TOKEN` and the repository secret or variable `SUPABASE_PROJECT_REF`. The token needs permission to read API gateway keys. These previews share the main project's Supabase Auth configuration and user pool; their application databases remain isolated on per-stack Neon branches. Also set the existing `RENDER_API_KEY`, `NEON_PROJECT_ID`, and `NEON_API_KEY`; if the Render token can access multiple workspaces, set `RENDER_OWNER_ID`. Connect the Starter GitHub repository to that Render workspace so Render can build generated preview branches. Each stack's Neon branch, API service, frontend service, and generated Git branch are deleted when the pull request closes. To allow Supabase email confirmation and password-reset links to return to the Render frontends, add `https://clubedge-starter-vite-**-web.onrender.com/**` under the Supabase project's Auth URL Configuration > Redirect URLs; [Supabase documents the wildcard format](https://supabase.com/docs/guides/auth/redirect-urls#use-wildcards-in-redirect-urls). Render free services can take about a minute to wake after inactivity. These settings apply only to the Starter repository and are not copied into generated projects. <!-- clubedge:only starter-repository -->

From your machine, `pnpm clubedge deploy --preview` does the same for the current Git branch. <!-- clubedge:only deploy=vercel|railway && framework=next|tanstack-start -->

<!-- clubedge:end -->

`/api/health` answers as long as the app runs, so platforms use it to decide whether to restart the app. `/api/ready` also checks that the database answers, returning 200 or 503 without details: point load balancers and readiness probes at it, so traffic waits while the database is unreachable instead of the app restarting.

Production needs these variables:

- `DATABASE_URL`, pointing at a managed PostgreSQL database.
- `NEXT_PUBLIC_APP_URL`, the deployed origin. Next.js compiles it into the build, server code included (sign-in links, Stripe return URLs), so it must be set when the image is built: Railway and Render pass the service's variable to the Docker build; on Fly.io set it under `[build.args]` in `fly.toml`; with the Docker workflow, set the repository variable `NEXT_PUBLIC_APP_URL`. <!-- clubedge:only framework=next -->
- `APP_URL`, the deployed origin. <!-- clubedge:only framework=tanstack-start -->
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, from the Supabase project. <!-- clubedge:only framework=next && auth=supabase -->
- `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`, from the Supabase project. <!-- clubedge:only framework=tanstack-start|none && auth=supabase -->
- `BETTER_AUTH_SECRET`, at least 32 random characters, different from development. <!-- clubedge:only auth=better-auth -->
- `BETTER_AUTH_URL`, the API's public `https://` URL, which `pnpm clubedge deploy` sets. <!-- clubedge:only auth=better-auth && framework=none -->
- `SUPABASE_SECRET_KEY`, if users should be able to delete their account. <!-- clubedge:only auth=supabase -->
- `SMTP_URL` and `EMAIL_FROM`; without them, production refuses to send email. <!-- clubedge:only email=smtp -->
- `RESEND_API_KEY` and `EMAIL_FROM`; without them, production refuses to send email. <!-- clubedge:only email=resend -->
- `STRIPE_SECRET_KEY` (live mode), `STRIPE_WEBHOOK_SECRET` from the production webhook endpoint, and `STRIPE_PRICE_<PLAN>` for each plan. <!-- clubedge:only payments=stripe -->
- `REDIS_URL`, when you run more than one instance. <!-- clubedge:only cache=redis -->
- `CRON_SECRET`, where no worker runs and a scheduler calls `/api/jobs/run`. <!-- clubedge:only jobs=pg-boss|bullmq -->
- `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY`, from your Inngest app; `INNGEST_DEV` unset. <!-- clubedge:only jobs=inngest -->
- `OTEL_EXPORTER_OTLP_ENDPOINT`, and `OTEL_EXPORTER_OTLP_HEADERS` if your collector needs a key. <!-- clubedge:only observability=otel -->
- `SENTRY_DSN`, and `SENTRY_ENVIRONMENT` to tell environments apart. <!-- clubedge:only observability=sentry -->
- The `STORAGE_*` variables for your S3-compatible bucket. <!-- clubedge:only storage=s3 -->
- `SUPABASE_STORAGE_BUCKET`. <!-- clubedge:only storage=supabase -->
- `CLIENT_IP_HEADER` or `TRUSTED_PROXY_HOPS`, for where the app runs: see [Client addresses](#client-addresses).

### Client addresses

Rate limits count requests per client address, so the server must know which address a request comes from. That depends on what sits in front of it, which two settings describe:

- `CLIENT_IP_HEADER`: a header your host sets to the client's address, replacing any copy the client sends. The address is that header's value.
- `TRUSTED_PROXY_HOPS`: how many reverse proxies you run in front of the server that append to `X-Forwarded-For`, such as Caddy, nginx, Traefik, or a load balancer. The address is the entry that many places from the end, the one your outermost proxy added; entries before it are whatever the client sent, so they never count.

`CLIENT_IP_HEADER` wins when both are set. Without either, or when a request lacks what they name, the address is the connection's own, which is right for a server that clients reach directly. A value that cannot be right stops the server at startup, and `pnpm check:env` reports it.

Next.js gives the app no connection address, so without either setting the address is the last `X-Forwarded-For` entry, the one the proxy nearest the app added: right on Vercel, which replaces the header with the client's address, and behind one proxy you run. Set your host's setting from the table anyway, since some hosts add more than one entry. <!-- clubedge:only framework=next -->
The frontend's server finds the address with its own settings and sends it to the API as the only `X-Forwarded-For` entry, dropping any address header the client sent. An API that only the frontend's server reaches, over a private network as in `docker-compose.yml`, sets `TRUSTED_PROXY_HOPS=1`. <!-- clubedge:only api!=none && framework!=none -->
Without a website, clients reach the API itself, so the API takes the setting for where it runs, from the table below. `pnpm clubedge deploy` sets it: `TRUSTED_PROXY_HOPS=1` with Docker Compose, behind Caddy, and `CLIENT_IP_HEADER=x-real-ip` on Railway. <!-- clubedge:only framework=none -->

| Where the app runs                    | Setting                                             |
| ------------------------------------- | --------------------------------------------------- |
| Railway                               | `CLIENT_IP_HEADER=x-real-ip`                        |
| Render                                | `CLIENT_IP_HEADER=cf-connecting-ip` (`render.yaml`) |
| Fly.io                                | `CLIENT_IP_HEADER=fly-client-ip` (`fly.toml`)       |
| Vercel                                | `CLIENT_IP_HEADER=x-real-ip`                        |
| Netlify                               | `CLIENT_IP_HEADER=x-nf-client-connection-ip`        |
| Behind proxies you run (Caddy, nginx) | `TRUSTED_PROXY_HOPS=1`, or the number of proxies    |
| Reached by clients directly           | Neither                                             |

Vercel and Netlify take runtime variables only from the project's settings, not from `vercel.json` or `netlify.toml`, so set `CLIENT_IP_HEADER` there with the others. <!-- clubedge:only framework!=none -->

## Checks

`pnpm clubedge doctor` checks that the project can run: Node.js and pnpm versions, installed dependencies, the lockfile, and `apps/web/.env.local` against the example, followed by `pnpm check:services`. Start there when something does not work. <!-- clubedge:only framework!=none -->
`pnpm clubedge doctor` checks that the project can run: Node.js and pnpm versions, installed dependencies, the lockfile, and `apps/api/.env.local` against the example, followed by `pnpm check:services`. Start there when something does not work. <!-- clubedge:only framework=none -->

Run the checks relevant to your change before opening a pull request:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
pnpm build
```

<!-- clubedge:if framework!=none -->

Browser checks use Playwright. Install Chromium once, then run `pnpm test:e2e`:

```sh
pnpm exec playwright install chromium
pnpm test:e2e
```

The Playwright configuration starts the local app with a placeholder database URL; browser scenarios should not require real provider credentials.

<!-- clubedge:end -->

CI (`.github/workflows/ci.yml`) also serves the API's production build and checks `/api/health` on port 3001, then builds the API's image, runs its migrations, and checks the image the same way. <!-- clubedge:only framework=none -->

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

<!-- clubedge:if api!=none && framework!=none -->

## The frontend and its API

The app is two apps that meet at one HTTP contract:

- `apps/web` is the frontend. It serves pages only and calls the API for everything else.
- `apps/api` is the API. It owns the database and the provider modules, and reads `apps/api/.env.local` (from `apps/api/.env.example`). The database commands read `DATABASE_URL` from there too.
- `packages/contract/openapi.yaml` is the contract between them. The frontend calls the API only through the client generated from it, so the API can be replaced by one in another language.

`pnpm dev` starts both: the frontend on <http://localhost:3000>, and the API on port 3001. The frontend's server forwards `/api` to the API (its `API_URL`), so the browser sees one origin and cookies stay first-party.

<!-- clubedge:end -->
<!-- clubedge:if framework=none -->

## Without a website

This project has no website: it is the API, in `apps/api`, and the native app, in `apps/mobile`, which calls the API directly through the client generated from its contract, `packages/contract/openapi.yaml`. <!-- clubedge:only mobile!=none -->
This project has no website: it is the API, in `apps/api`, which clients call directly, and its contract, `packages/contract/openapi.yaml`. <!-- clubedge:only mobile=none -->
The API owns the database and the provider modules, and reads `apps/api/.env.local` (from `apps/api/.env.example`); the database commands read `DATABASE_URL` from there too.

`pnpm dev` starts the API on port 3001, and `pnpm start` serves its production build there. In development it listens on every interface (`HOST=0.0.0.0`), so a phone or another device on the same network reaches it at this computer's address. `pnpm check:services` and `pnpm check:env` check the API, and `pnpm docker:dev` runs it alone in Docker Compose, on the same port.

With the API running, `pnpm --filter @clubedge/mobile-app android` (or `ios`) builds the native app and starts it on an emulator or a phone. Left blank in development, its `EXPO_PUBLIC_API_URL`, in `apps/mobile/.env.local`, means the API on this computer at port 3001 (`EXPO_PUBLIC_DEV_SERVER_PORT`): `http://10.0.2.2:3001` from the Android emulator and `http://localhost:3001` from the iOS simulator. On a phone, set it to `http://<your computer's address>:3001`. [The native app](#the-native-app) has the details. <!-- clubedge:only mobile!=none -->

Better Auth runs in the API, which serves it at `/api/auth`; [Better Auth](#better-auth) lists its settings. <!-- clubedge:only auth=better-auth -->
It trusts the native app's address scheme, made from the site config's `serviceId`, so the app signs in there. <!-- clubedge:only auth=better-auth && mobile!=none -->

Emailed links open the native app, through its address scheme: confirming a new account opens its sign-in screen, and a password reset link opens its reset screen, which sets the new password. <!-- clubedge:only auth=better-auth && email!=none && mobile!=none -->
Supabase's emailed links open the native app, through its address scheme, once Supabase's Redirect URLs list that scheme, such as `my-product://**` (see [Supabase Auth](#supabase-auth)): confirming a new account opens the app's sign-in screen, and a password reset link opens its reset screen, which sets the new password. <!-- clubedge:only auth=supabase && mobile!=none -->

`pnpm clubedge deploy` publishes the API itself, with Docker Compose: Caddy serves it at your `DOMAIN` over HTTPS. <!-- clubedge:only deploy=docker -->
`pnpm clubedge deploy` publishes the API itself on Railway, as the project's one public service, with its own `*.up.railway.app` domain. <!-- clubedge:only deploy=railway -->
For the native app's release builds, set its `EXPO_PUBLIC_API_URL` to that `https://` address. <!-- clubedge:only mobile!=none -->
[Deploy](#deploy) has the details.

<!-- clubedge:end -->
<!-- clubedge:if api!=none -->

To change the API, edit `openapi.yaml` first, run `pnpm --filter @clubedge/contract generate`, then implement the change in the API. Its tests run `@clubedge/contract/conformance`, the suite every API passes; run it against any running API with:

```sh
API_URL=http://127.0.0.1:3001 pnpm exec vitest run packages/contract/src/remote.test.ts
```

Some endpoints are an optional part of a module, a capability (`x-clubedge-capability` in `openapi.yaml`): the display name and account deletion of the account settings are the `account` capability of the auth module. An API without a capability answers its endpoints with 404, and the suite checks that unless `API_CAPABILITIES` lists it (such as `API_CAPABILITIES=account`).

The settings page changes passwords with the auth provider, in the browser or in Better Auth's server, which signs out the user's other sessions and applies the provider's rate limits. The display name and account deletion go through the API, which keeps the app's data: deletion checks the password (10 tries a minute per user, refused while the limit cannot be checked), removes the user's app data, then deletes the user from the provider. <!-- clubedge:only auth!=none && api=hono|fastapi && framework!=none -->
Passwords change with the auth provider, which signs out the user's other sessions and applies its rate limits. The display name and account deletion go through the API, which keeps the app's data: deletion checks the password (10 tries a minute per user, refused while the limit cannot be checked), removes the user's app data, then deletes the user from the provider. <!-- clubedge:only auth!=none && framework=none -->

In production, run each app's image: `apps/vite/Dockerfile` (the frontend, served by Node with `API_URL` set to the API's address) and the selected API image (`apps/api/Dockerfile` or `apps/api-fastapi/Dockerfile`). `pnpm docker:dev` runs both, with `docker compose -f docker-compose.yml up --build`: name the file, since `compose.yaml` from `pnpm clubedge deploy` would take its place. <!-- clubedge:only framework!=none -->
In production, run the API's image, built from `apps/api/Dockerfile` as [Docker](#docker) describes. `pnpm docker:dev` runs it with `docker compose -f docker-compose.yml up --build`: name the file, since `compose.yaml` from `pnpm clubedge deploy` would take its place. <!-- clubedge:only framework=none -->

Run `node migrate.mjs` in the API's image before a new version starts. <!-- clubedge:only api=hono -->
The API is in Python and managed with [uv](https://docs.astral.sh/uv/): its `package.json` scripts call uv, ruff, mypy, and pytest, so `pnpm dev`, `pnpm lint`, `pnpm typecheck`, and `pnpm test` run it like the other apps. The database schema and migrations stay in `packages/db`, and the API's image bundles their Node migrator: run `node migrate.mjs` in it before a new version starts. <!-- clubedge:only api=fastapi -->

### Apps installed on phones

An app installed on a phone calls the API and keeps the version it shipped with, often for months. It asks `/api/app-version` which versions the API serves, and the answer is never cached, so a change applies on each app's next check, with no new release of the app. Set them in `apps/api/.env.local`, or in the API's environment in production; each is `null` while unset:

- `APP_MINIMUM_VERSION`, the oldest app version the API still serves: below it, the app shows a blocking update screen.
- `APP_LATEST_VERSION`, the newest released version: below it, the app may show an optional update notice.
- `APP_UPDATE_URL`, where to get the update: an `https://` link to the store listing or a download page.
- `APP_NEXT_MINIMUM_VERSION` and `APP_NEXT_MINIMUM_VERSION_FROM`, a minimum announced for a date and time with its time zone, such as `2026-11-01T00:00:00Z`. Until then, apps below it keep working and tell their users to update by that date; from then, the API requires it, with no redeploy.

Each can be set for one platform by adding `_IOS` or `_ANDROID` to its name, such as `APP_UPDATE_URL_IOS` for the App Store listing and `APP_UPDATE_URL_ANDROID` for Google Play, or `APP_LATEST_VERSION_IOS` while App Store review holds a release Google Play already has. The apps say which platform they run on, and the platform's own value wins over the shared one.

Versions are `MAJOR.MINOR.PATCH`, such as `1.4.0`. The latest may not be older than the minimum, nor the announced minimum, and the announced minimum must be newer than the current one. Other values fail the request rather than reach the apps, and `pnpm check:env` lists them before a deploy.

The apps also send their version (`X-App-Version`) and platform (`X-App-Platform`) with every request. To a request whose version is below the minimum, the API answers `426 update_required`, on every route but `/api/health`, `/api/ready`, and `/api/app-version`, so an app left open for days shows its update screen at its next request, not only when it starts again. Apps built from a Starter before v0.29.0 send no version: the API serves them, and they find the new minimum at their next start. The version is what the app says it is, so this keeps old apps from calling an API they no longer match; it is not a security control.

For an urgent fix, raise `APP_MINIMUM_VERSION` itself: the apps below it stop at their next request (older builds, at their next start). Once a security fix is out, don't lower the minimum again, even to roll back a broken release: ship a fixed version instead.

Installed apps keep calling the contract they shipped with, so change `openapi.yaml` only in ways they survive: add fields and operations, but never remove or rename them, and never make an optional request field required. The CI workflow's `contract` job compares each pull request's contract with its base branch's using [oasdiff](https://github.com/oasdiff/oasdiff), and fails on a change that breaks existing clients. For a deliberate break before any app has shipped, label the pull request `breaking-contract` and run the job again. Once apps have shipped, a break also needs `APP_MINIMUM_VERSION` raised to the first version that handles it, so older apps ask for an update instead of failing.

<!-- clubedge:end -->

<!-- clubedge:if shell!=none -->

## The mobile app

`apps/shell` packages the web app as an Android and iOS app with [Capacitor](https://capacitorjs.com). The app's pages load from the device: they are the web app built in Vite's `app` mode, which calls the API through your deployed website and keeps the session on the device. Building it needs [Android Studio](https://developer.android.com/studio) 2025.2.1 or newer for Android (it brings the Java 21 that Capacitor 8 builds with), and a Mac with [Xcode](https://developer.apple.com/xcode/) 26 or newer for iOS, whose project uses Swift Package Manager rather than CocoaPods. Capacitor's [environment setup](https://capacitorjs.com/docs/getting-started/environment-setup) has the details.

1. Set your app's id in `apps/shell/capacitor.config.ts`: a reverse-domain name you own, such as `com.yourcompany.app`. It becomes permanent once the Android and iOS projects exist and a store lists the app, so set it before the first build. The app's name comes from `apps/web/src/config/site.json`.
2. Set `WEB_URL` in `apps/shell/.env.local` to the website's public `https://` address, such as `https://app.example.com`. The build refuses any other: the app sends its session there.
3. Run `pnpm --filter @clubedge/shell android` (or `ios`). It builds the web app for the app, creates `apps/shell/android` (or `apps/shell/ios`) on the first run, copies the build into it, and opens Android Studio (or Xcode), where you run the app on a device or an emulator. Commit `android/` and `ios/`: from then on they are your app's own, with its icons, permissions, and signing settings. The first run also makes the app's icons and splash screens from the art in `apps/shell/assets`, with Capacitor's asset tool (run through npx, so it needs the network then):
   - `logo.svg`, the icon: the white mark on the brand's blue square.
   - `splash.svg` and `splash-dark.svg`, iOS's splash screens: the blue mark in the middle of the light and dark backgrounds.
   - `splash-icon.png`, the blue mark alone, which Android draws in the middle of those backgrounds at 128dp. Android 12 and later show it through a circle 192dp across, which the mark stays inside, and no screen's shape stretches it.

   After changing them, run `pnpm --filter @clubedge/shell icons`, and set the colors to match at the top of `apps/shell/scripts/icons.mjs`.

After changing the web app, `pnpm --filter @clubedge/shell sync` copies a new build into the native projects. [Store releases](#store-releases) builds them for the stores, signed. The project's CI builds a debug APK too; set a `WEB_URL` repository variable so that it calls your website.

How the app differs from the website:

- Its pages load from `https://localhost` on Android and `capacitor://localhost` on iOS. The website's server answers these origins' calls to `/api` with CORS headers; they are its `MOBILE_ORIGINS`, which you only set to change them.
- It keeps its session in the device's storage, private to the app, and sends it with each call, since the website's cookies never reach it.
- Better Auth signs the app in with bearer tokens (its bearer plugin), and only the app receives them: the website keeps its HttpOnly cookie. <!-- clubedge:only auth=better-auth -->
- Supabase keeps the app's session in the device's storage. <!-- clubedge:only auth=supabase -->
- Firebase Authentication keeps the app's session in the WebView's IndexedDB, and starts without the frame its pop-up and redirect sign-in need, which would never load in an iOS WebView. <!-- clubedge:only auth=firebase -->
- In your Appwrite project, add a **Web** platform with the hostname `localhost` too: the app's pages use it. Appwrite's SDK keeps the app's session itself. <!-- clubedge:only auth=appwrite -->
- Emailed links, such as sign-up confirmations and password resets, open the website, never the app. After confirming an address, sign in again in the app.
- The app has no billing: app stores require their own in-app purchases for digital goods, so subscriptions stay on the website. <!-- clubedge:only payments!=none -->
- Its build reads `apps/web/.env.local` too, and the settings in `apps/shell/.env.local` win. Give it the deployed website's public settings (`VITE_*`) where development uses others.

To see changes on a device as you make them, the app can load its pages from your computer's dev server instead (live reload). After a first `pnpm --filter @clubedge/shell android` (or `ios`), start the web app in app mode, and run the app on a device or an emulator on the same network:

```sh
pnpm --filter @clubedge/web dev --mode app
pnpm --filter @clubedge/shell exec cap run android --live-reload
```

The app then loads `http://<your computer's address>:3000` (change it with `--host` and `--port`; `ios` for iOS). Add that address to `MOBILE_ORIGINS` in `apps/web/.env.local` first, so Better Auth accepts the app's sign-in. <!-- clubedge:only auth=better-auth -->
The app then loads `http://<your computer's address>:3000` (change it with `--host` and `--port`; `ios` for iOS). <!-- clubedge:only auth!=better-auth -->
Ctrl+C stops it. The installed app keeps loading its pages from your computer until you install a normal build again.

### Updates

The app compares its version with the versions the API serves ([Apps installed on phones](#apps-installed-on-phones)) when it starts, when it comes back to the foreground (at most every 15 minutes), and whenever the API answers one of its requests `426 update_required`:

- Below `APP_MINIMUM_VERSION`, it shows **Update required**, a screen that keeps the app closed, with an **Update** button that opens `APP_UPDATE_URL` in the phone's browser. The app remembers it, so it holds when the app next starts offline, until it is updated.
- Below `APP_NEXT_MINIMUM_VERSION`, a notice above the page says the date it stops working, with the same button. **Not now** hides it until the next day.
- Below `APP_LATEST_VERSION` only, a notice offers the update, and **Not now** hides it until a newer version is out.
- When the API cannot be reached, or does not know `/api/app-version` yet, nothing new shows: a remembered **Update required** still holds, and otherwise the app works as usual.

The app's version is `version` in `apps/shell/version.json`, as `MAJOR.MINOR.PATCH`, such as `1.4.0`, which each build writes into both native projects: raise it with each release ([Store releases](#store-releases)).

### Store releases

The app's version, which the stores show and the update notice compares, is in `apps/shell/version.json`. Each build writes it into both native projects, with the build number the stores order builds by, made from it: 1.4.2 is build 1004002. Set a newer one for each release:

```sh
pnpm --filter @clubedge/shell set-version 1.5.0
```

`pnpm --filter @clubedge/shell release android` (or `ios`) then builds the release, signed: an App Bundle for Google Play, or an IPA for the App Store, which it copies to `apps/shell/release/`. It signs with the settings in `apps/shell/.env.local`:

- Android: your upload key, a keystore you make once and keep outside the repository, with `keytool -genkeypair -v -keystore upload.keystore -alias upload -keyalg RSA -keysize 2048 -validity 10000`. Set `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`. Gradle builds the bundle, and the JDK's `jarsigner`, from `JAVA_HOME` or the `PATH`, signs it. Google Play signs the published app with a key of its own ([Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756)).
- iOS, on a Mac: `IOS_TEAM_ID`, your Apple Developer team, for Xcode's automatic signing. To sign manually, as CI does, name the distribution certificate (`IOS_SIGNING_CERTIFICATE`, such as `Apple Distribution`) and the provisioning profile (`IOS_PROVISIONING_PROFILE`, its name or UUID), both installed.

The **Mobile app release** workflow (`.github/workflows/shell-release.yml`, which you run from the Actions tab) does the same on GitHub's runners, keeps each build as the run's artifact, and can upload the iOS build to TestFlight. It builds for the website in the `WEB_URL` repository variable, with these repository secrets:

| Secret                                                                             | What it holds                                                                                       |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `ANDROID_KEYSTORE_BASE64`                                                          | The upload keystore, as base64: `base64 -w0 upload.keystore` (`base64 -i upload.keystore` on a Mac) |
| `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`           | Its passwords, and the key's alias                                                                  |
| `IOS_CERTIFICATE_BASE64`, `IOS_CERTIFICATE_PASSWORD`                               | The distribution certificate, exported from Keychain Access as a .p12, as base64, and its password  |
| `IOS_PROVISIONING_PROFILE_BASE64`, `IOS_PROVISIONING_PROFILE`                      | The App Store provisioning profile, as base64, and its name                                         |
| `IOS_TEAM_ID`, `IOS_SIGNING_CERTIFICATE`                                           | Your team, and the certificate's name (`Apple Distribution` when unset)                             |
| `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID`, `APP_STORE_CONNECT_KEY` | For TestFlight: an App Store Connect API key's id, its issuer, and its .p8 file's content           |

Google Play takes an app's first upload in its console; later ones can come from the workflow's artifact. Once the stores publish a release, set the API's `APP_LATEST_VERSION` to it ([Apps installed on phones](#apps-installed-on-phones)).

### The demo

`pnpm --filter @clubedge/shell android --demo` (or `ios --demo`) builds a demo of the app, for trying it or for store screenshots: it needs no server and no `WEB_URL`. In its build, sign-in and the API answer from memory on the device, with fakes from `packages/mobile/src/demo`:

- Any email and password sign in a demo user; sign-up and password reset say they are off.
- The settings work until the app closes, and deleting the account signs out.
- Other calls answer as an API with nothing set up would, and routes the demo leaves out answer 404, as for a module the project does not have.
- A banner says it is a demo, with sample data that stays on the device.

Builds without `--demo` contain none of it. The demo replaces the app's build in the native project, so run `pnpm --filter @clubedge/shell sync` before building a release.

<!-- clubedge:end -->

<!-- clubedge:if mobile!=none -->

## The native app

`apps/mobile` is a native Android and iOS app, built with [Expo](https://expo.dev) (SDK 58) and React Native, with its own screens: a welcome screen and sign-in, then two tabs, a dashboard and the settings, with the user's profile. <!-- clubedge:only auth!=none -->
`apps/mobile` is a native Android and iOS app, built with [Expo](https://expo.dev) (SDK 58) and React Native, with its own screens. <!-- clubedge:only auth=none -->
It calls the API through your website, as the website does, with the same contract client (`@clubedge/contract`). Expo generates its Android and iOS projects from `apps/mobile/app.config.ts` whenever it builds them (`expo prebuild`), so `android/` and `ios/` are not committed, and upgrades only change the app's TypeScript and config. <!-- clubedge:only framework!=none -->
It calls the API directly, with the contract client (`@clubedge/contract`). Expo generates its Android and iOS projects from `apps/mobile/app.config.ts` whenever it builds them (`expo prebuild`), so `android/` and `ios/` are not committed, and upgrades only change the app's TypeScript and config. <!-- clubedge:only framework=none -->

The app runs as a development build, which needs [Android Studio](https://developer.android.com/studio) for Android, and a Mac with [Xcode](https://developer.apple.com/xcode/) for iOS, as Expo's [environment setup](https://docs.expo.dev/get-started/set-up-your-environment/) describes. Expo Go, the store app that runs projects without building them, does not support SDK 58 yet.

The app signs in with Supabase itself: before building it, set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `apps/mobile/.env.local` to the API's Supabase settings. <!-- clubedge:only auth=supabase && framework=none -->

<!-- clubedge:end -->
<!-- clubedge:if mobile!=none && framework!=none -->

1. Set your app's id in `apps/mobile/app.config.ts`: a reverse-domain name you own, such as `com.yourcompany.app`. It becomes permanent once a store lists the app, so set it before the first release build. The app's name and its address scheme come from `apps/mobile/src/config/site.json`.
2. Start the website and the API with `pnpm dev`. In development, the app calls them at `http://10.0.2.2:3000` from the Android emulator and at `http://localhost:3000` from the iOS simulator; on a phone, set `EXPO_PUBLIC_API_URL` in `apps/mobile/.env.local` to `http://<your computer's address>:3000`.
   Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` there too, to the website's Supabase settings. <!-- clubedge:only auth=supabase -->
3. Run `pnpm --filter @clubedge/mobile-app android` (or `ios`). The first run generates the native project, builds the app, installs it on a running emulator or a connected phone, and starts Expo's dev server, which reloads the app as you change it. Later, `pnpm --filter @clubedge/mobile-app start` starts the dev server for the installed build; build again after adding a package with native code.

<!-- clubedge:end -->
<!-- clubedge:if starter-repository -->
<!-- In generated projects without a website, the block below supplies these steps; its comment keeps it hidden here. -->
<!-- clubedge:end -->
<!-- clubedge:if mobile!=none && framework=none

1. Set your app's id in `apps/mobile/app.config.ts`: a reverse-domain name you own, such as `com.yourcompany.app`. It becomes permanent once a store lists the app, so set it before the first release build. The app's name and its address scheme come from `apps/mobile/src/config/site.json`.
2. Start the API with `pnpm dev`. In development, the app calls it at `http://10.0.2.2:3001` from the Android emulator and at `http://localhost:3001` from the iOS simulator; on a phone, set `EXPO_PUBLIC_API_URL` in `apps/mobile/.env.local` to `http://<your computer's address>:3001`.
3. Run `pnpm --filter @clubedge/mobile-app android` (or `ios`). The first run generates the native project, builds the app, installs it on a running emulator or a connected phone, and starts Expo's dev server, which reloads the app as you change it. Later, `pnpm --filter @clubedge/mobile-app start` starts the dev server for the installed build; build again after adding a package with native code.

<!-- clubedge:end -->
<!-- clubedge:if mobile!=none -->

A release calls the website's public `https://` address, `EXPO_PUBLIC_API_URL`, which is built into the app: [Store releases of the native app](#store-releases-of-the-native-app) builds it for the stores. The project's CI builds a release APK signed with a debug key, for trying on a device; set an `EXPO_PUBLIC_API_URL` repository variable so that it calls your website. <!-- clubedge:only framework!=none -->
A release calls the API's public `https://` address, `EXPO_PUBLIC_API_URL`, which is built into the app: [Store releases of the native app](#store-releases-of-the-native-app) builds it for the stores. The project's CI builds a release APK signed with a debug key, for trying on a device; set an `EXPO_PUBLIC_API_URL` repository variable so that it calls your API. <!-- clubedge:only framework=none -->

How the app works with the website: <!-- clubedge:only framework!=none -->
How the app works with the API: <!-- clubedge:only framework=none -->

- Better Auth runs on the website, which trusts the app's address scheme (made from the site config's `serviceId`). Its Expo plugin keeps the session cookie in the device's secure storage and sends it with the app's calls. <!-- clubedge:only auth=better-auth && framework!=none -->
- Better Auth runs in the API, which trusts the app's address scheme (made from the site config's `serviceId`). Its Expo plugin keeps the session cookie in the device's secure storage and sends it with the app's calls. <!-- clubedge:only auth=better-auth && framework=none -->
- Supabase keeps the app's session in the app's storage on the device, and the app sends its access token to the API, as the website does. <!-- clubedge:only auth=supabase && framework!=none -->
- Supabase keeps the app's session in the app's storage on the device, and the app sends its access token to the API with each call. <!-- clubedge:only auth=supabase && framework=none -->
- The app sends no browser origin, so CORS settings do not apply to it.
- Emailed links, such as sign-up confirmations and password resets, open the website. After confirming an address or setting a new password, sign in again in the app. <!-- clubedge:only auth!=none && framework!=none -->
- Emailed links open the app, through its address scheme: confirming a new account opens its sign-in screen, and a password reset link opens its reset screen, which sets the new password. <!-- clubedge:only auth=better-auth && email!=none && framework=none -->
- Supabase's emailed links open the app, through its address scheme, once its Redirect URLs list it (see [Supabase Auth](#supabase-auth)): confirming a new account opens the sign-in screen, and a password reset link opens the reset screen, which sets the new password. <!-- clubedge:only auth=supabase && framework=none -->
- The Settings tab holds the account: the display name, a Dark mode switch that holds over the phone's appearance, the password, deleting the account (as the App Store requires of apps that let people sign up), and signing out of this device or of all of them. <!-- clubedge:only auth!=none -->
- The app has no billing: app stores require their own in-app purchases for digital goods, so subscriptions stay on the website. <!-- clubedge:only payments!=none -->
- Its icon, Android's adaptive icon, and its splash screen are the images in `apps/mobile/assets`, which `app.config.ts` names.
- Its look is in `apps/mobile/src/lib/theme.ts`: its colors, in light and dark, and its type scale, in Inter, which loads while the splash screen shows.
- The welcome screen shows the brand's blue and the app's mark. For a photo of your own there, add it to `apps/mobile/assets` and set `heroPhoto` in `apps/mobile/src/app/welcome.tsx`. <!-- clubedge:only auth!=none -->
- The welcome and sign-up screens link to your Terms and Privacy Policy: set their addresses, `links.terms` and `links.privacy` in `apps/mobile/src/config/site.json`, before the first release. The stores ask for a privacy policy too. <!-- clubedge:only auth!=none -->

The app compares its version, `version` in `app.json` (`MAJOR.MINOR.PATCH`; raise it with each release), with the versions the API serves ([Apps installed on phones](#apps-installed-on-phones)) when it starts, when it comes back to the foreground (at most every 15 minutes), and whenever the API answers one of its requests `426 update_required`. Below `APP_MINIMUM_VERSION`, it shows only **Update to continue**, with the installed and required versions and an **Update now** button that opens `APP_UPDATE_URL`, and remembers it, so it holds when the app next starts offline, until it is updated. Below `APP_NEXT_MINIMUM_VERSION`, a sheet over any screen offers the update, with the date this version stops working and the days left; **Not now** hides it until the next day. Below `APP_LATEST_VERSION`, a banner on Home offers the update, and its close button hides it until a newer version is out. All of them are in `src/components/update-gate.tsx`. The logic is shared with the API in `packages/contract` (`app-version.ts` and `app-update.ts`).

### Store releases of the native app

The app's version, which the stores show and the update notice compares, is `version` in `apps/mobile/app.json`, from which `app.config.ts` makes both stores' build number: 1.4.2 is build 1004002. A project from Starter v0.29.0 or earlier kept its version in `app.config.ts`: after upgrading, keep the Starter's `app.config.ts`, and carry your version over with `set-version`. Set a newer one for each release:

```sh
pnpm --filter @clubedge/mobile-app set-version 1.5.0
```

The app builds with [EAS Build](https://docs.expo.dev/build/introduction/), in Expo's cloud, with the profiles in `apps/mobile/eas.json`: `development` for a development build on your devices, `preview` for a release build to share (an APK on Android), and `production` for the stores. Once, from `apps/mobile`:

1. Link the app to an Expo project with `pnpm dlx eas-cli@latest init`, which writes the project's id into `app.json`.
2. Give each EAS environment the address the app calls, since `.env.local` stays on your computer: `pnpm dlx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_API_URL --value https://app.example.com --visibility plaintext`, and the same for `preview`.
3. Run a first build interactively, `pnpm dlx eas-cli@latest build --profile production`, which sets up the signing credentials EAS then keeps: Android's upload key, and on iOS, with your Apple Developer account, a distribution certificate and a provisioning profile.

From then on, the **Native app release** workflow (`.github/workflows/expo-release.yml`, which you run from the Actions tab) queues builds with an `EXPO_TOKEN` repository secret (expo.dev, Account settings, Access tokens), and submits production builds to the stores when asked, with the stores' credentials that the first `eas submit` asks for. Once the stores publish a release, set the API's `APP_LATEST_VERSION` to it ([Apps installed on phones](#apps-installed-on-phones)). To build on your computer instead, run `pnpm --filter @clubedge/mobile-app prebuild`, then Android Studio or Xcode, with your own signing key and `EXPO_PUBLIC_API_URL` set in `apps/mobile/.env.local`.

<!-- clubedge:end -->

<!-- clubedge:if ota=eas -->

### Over-the-air updates

With [EAS Update](https://docs.expo.dev/eas-update/introduction/), a change to the app's JavaScript or assets reaches the installed apps without a store release. Each build profile in `apps/mobile/eas.json` names its channel, and an update reaches only the builds of the same version (`runtimeVersion` follows `version`): a change to native code, a package with native code, or `app.config.ts` needs a new version and a store release.

- The app checks for an update when it starts and when it comes back to the foreground, at most every 15 minutes, and downloads it. Home then offers to restart into it; otherwise the app starts with it next time. Debug builds, and builds made before `eas init`, don't check.
- The **Native app update** workflow (`.github/workflows/expo-update.yml`) publishes one to a channel, with the `EXPO_TOKEN` secret. From `apps/mobile`, `pnpm dlx eas-cli@latest update --channel production --environment production --message "What it changes"` does too.
- expo.dev lists each channel's updates, and rolls one back by publishing an earlier one again.

<!-- clubedge:end -->

<!-- clubedge:if push!=none -->

## Push notifications

A signed-in user turns notifications on in the app's settings, which asks for the phone's permission and saves the device's push token with the API (`POST /api/push/devices`); **Send a test notification** then sends one to each of their devices. The app sends its token again at each start, as a push service can change it, and forgets it when notifications are turned off or the user signs out, so a signed-out phone gets no more of the account's notifications. A tapped notification opens the screen its data names (`url`), and the API forgets the tokens of uninstalled apps.

<!-- clubedge:end -->
<!-- clubedge:if push!=none && api=hono -->

Send your own from the API's code, such as a background job:

```ts
import { push } from "@/server/push";

await push.send(user, {
  title: "Your report is ready",
  body: "Open it in the app.",
  data: { url: "/" },
});
```

<!-- clubedge:end -->
<!-- clubedge:if push!=none && api=fastapi -->

Send your own from the API's code, such as a background job:

```python
from clubedge_api.push import PushMessage
from clubedge_api.push_service import push_notifications

await push_notifications().send(
    user, PushMessage("Your report is ready", "Open it in the app.", {"url": "/"})
)
```

<!-- clubedge:end -->
<!-- clubedge:if push=expo -->

The notifications go through [Expo's push service](https://docs.expo.dev/push-notifications/overview/), which delivers them with credentials EAS keeps for the app. Use a phone to try them: simulators get no push token.

1. Link the app to an Expo project with `eas init` ([Store releases of the native app](#store-releases-of-the-native-app)): its Expo push tokens need the project's id.
2. Android: create a [Firebase](https://console.firebase.google.com) project, add an Android app with your app's id, save its `google-services.json` in `apps/mobile`, and set `GOOGLE_SERVICES_JSON=./google-services.json` in `apps/mobile/.env.local`; EAS builds take the file from an EAS file variable of that name. Then upload the Firebase project's service account key to EAS: `pnpm dlx eas-cli@latest credentials`, Android, _Google Service Account_, _Push Notifications (FCM V1)_.
3. iOS: an interactive `eas build` or `eas credentials` sets up the app's push key with your Apple Developer account.
4. Set `EXPO_ACCESS_TOKEN` in the API's environment only if you turn on enhanced push security in the Expo project's settings.

<!-- clubedge:end -->
<!-- clubedge:if push=native -->

The API sends straight to FCM for Android and APNs for iOS. A platform whose credentials are unset gets no notifications, and its devices' tokens wait for them; `pnpm check:env` reports a service with only some of its credentials. Use a phone to try them: simulators get no push token.

- Android: create a [Firebase](https://console.firebase.google.com) project and add an Android app with your app's id, then save its `google-services.json` where the apps' builds find it:
  - in `apps/mobile`, with `GOOGLE_SERVICES_JSON=./google-services.json` in `apps/mobile/.env.local` (EAS builds take it from an EAS file variable of that name), for the native app; <!-- clubedge:only mobile!=none -->
  - in `apps/shell`, from which each build of the mobile app copies it into `android/app`. <!-- clubedge:only shell!=none -->

  For the API, create a service account key (Project settings, Service accounts, Generate new private key) and set `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, and `FCM_PRIVATE_KEY` from it.

- iOS: turn on Push Notifications for your app's identifier in the Apple Developer portal, and create an APNs authentication key (Keys, with Apple Push Notifications service). Set `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY` (the .p8 file's content), and `APNS_TOPIC`, your app's id. Builds from Xcode use Apple's sandbox, which needs `APNS_ENVIRONMENT=development`; TestFlight and the App Store use production.
- The native app's build adds the push capability itself. <!-- clubedge:only mobile!=none -->
- Each build of the mobile app adds the push entitlement to `apps/shell/ios`, and the app delegate's methods that pass the device's token to Capacitor's plugin. <!-- clubedge:only shell!=none -->

<!-- clubedge:end -->

## Before deploying

This project is a starting point; review the security and operational choices for your application before production use:

- Set production environment variables through your hosting provider's secret manager. Use unique, rotated credentials and TLS for external connections.
- Set the app URL variable to the deployed origin and add its `/auth/callback` URL to Supabase's allowed redirect URLs. <!-- clubedge:only auth=supabase && framework!=none -->
- Add the native app's address scheme to Supabase's allowed redirect URLs. <!-- clubedge:only auth=supabase && framework=none && mobile!=none -->
- Make authenticated server routes call `getCurrentUser()` or `requireUser()` from `@/server/auth` (the latter throws a 401 `AppError`), and protect pages with `getPageUser`, which redirects signed-out visitors to `/login`. Do not treat cookie contents alone as proof of identity. <!-- clubedge:only auth!=none && framework!=none -->
- Make every API route that acts for a user check the request's user first, as the account routes do, and answer 401 without one. Do not trust a user id that a client sends. <!-- clubedge:only auth!=none && framework=none -->
- Authorize storage access and validate upload size, content type, and object ownership in the route before using the storage adapter. <!-- clubedge:only storage!=none -->
- Configure Redis for rate limiting when you deploy more than one instance; the in-memory fallback does not share counts between instances. <!-- clubedge:only cache=redis -->
- The rate limiter keeps counts in memory, so deploy one instance or switch to a shared store before scaling out. <!-- clubedge:only cache=memory -->
- Tell the server where each client's address is for your host, with `CLIENT_IP_HEADER` or `TRUSTED_PROXY_HOPS`, so rate limits count each client on its own: see [Client addresses](#client-addresses).
- Configure and verify a restrictive Content Security Policy for the scripts and asset origins used by your deployment. A generic policy is not included because it can break framework tooling and project-specific assets. <!-- clubedge:only framework!=none -->
- Review database migration and backup procedures, provider access policies, and application-specific error handling.

## Troubleshooting

- **Environment validation fails:** confirm you copied the example to `apps/web/.env.local` and set `DATABASE_URL`. The error names the module whose variables are invalid. <!-- clubedge:only framework!=none -->
- **Environment validation fails:** confirm you copied the example to `apps/api/.env.local` and set `DATABASE_URL`. The error names the module whose variables are invalid. <!-- clubedge:only framework=none -->
- **Auth redirects fail:** add the exact local or deployed `/auth/callback` URL to Supabase Auth's allowed redirect URLs. <!-- clubedge:only auth=supabase && framework!=none -->
- **Emailed links do not open the app:** add the native app's address scheme, such as `my-product://**`, to Supabase Auth's Redirect URLs. <!-- clubedge:only auth=supabase && framework=none && mobile!=none -->
- **Database connection fails:** check the URL, network access, and whether your provider expects a transaction pooler. Keep `prepare: false` for the current Supabase pooler setup.
- **Redis cannot connect:** check that the URL uses `redis://` or `rediss://`, credentials are current, and outbound TCP access is allowed. <!-- clubedge:only cache=redis -->
- **The mobile app cannot reach the API:** check that `WEB_URL` in `apps/shell/.env.local` is the deployed website's address and that the website's `MOBILE_ORIGINS` lists the app's origins, then run `pnpm --filter @clubedge/shell sync` again. <!-- clubedge:only shell!=none -->
- **The native app cannot reach the API:** check `EXPO_PUBLIC_API_URL` in `apps/mobile/.env.local`. A release build needs the website's `https://` address, and a phone in development your computer's address on the same network. The value is built into the app, so build it again after changing it. <!-- clubedge:only mobile!=none && framework!=none -->
- **The native app cannot reach the API:** check `EXPO_PUBLIC_API_URL` in `apps/mobile/.env.local`. A release build needs the API's `https://` address, and a phone in development your computer's address on the same network, with port 3001. The value is built into the app, so build it again after changing it. <!-- clubedge:only mobile!=none && framework=none -->
- **Playwright cannot find Chromium:** run `pnpm exec playwright install chromium`. <!-- clubedge:only framework!=none -->
- **A package file appears missing after an offline install:** retry with a normal registry-backed `pnpm install`; an incomplete local package cache can satisfy offline resolution while leaving package contents incomplete.

# Setup guide

This guide covers local development and provider setup for Clubedge Starter. Start with the [README](README.md) for the architecture overview, then follow only the provider sections your project needs.

## 1. Install the toolchain

Install Node.js 22.12 or newer, then enable Corepack and install pnpm dependencies from the repository root:

```sh
corepack enable
pnpm install
```

The root `package.json` pins pnpm 10.9.0 through its `packageManager` field. Use a compatible pnpm 10 release if Corepack is not available.

If pnpm reports that it ignored a package build script needed by your environment, review the package name and approve only the required dependency with `pnpm approve-builds`.

## 2. Configure local environment

Copy `.env.example` to `apps/web/.env.local`.

PowerShell:

```powershell
Copy-Item .env.example apps/web/.env.local
```

macOS/Linux:

```sh
cp .env.example apps/web/.env.local
```

The example file leaves optional provider URLs and keys blank so the app can build and start without connecting to real services. At minimum, set `DATABASE_URL`; set the Supabase values when you want to use authentication.

Edit these values as needed:

| Variable                               | Required          | Description                                                                                        |
| -------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                         | Yes               | PostgreSQL connection URL. Use a Supabase transaction pooler URL or another PostgreSQL connection. |
| `NEXT_PUBLIC_SUPABASE_URL`             | For Supabase Auth | Project URL, such as `https://<project-ref>.supabase.co`.                                          |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | For Supabase Auth | Supabase publishable key. This key is intended for the browser; never use a service role key here. |
| `NEXT_PUBLIC_APP_URL`                  | Recommended       | The app's origin, defaulting to `http://localhost:3000`.                                           |

`DATABASE_URL` must be a non-empty string for server environment validation. If you are only exploring the UI, you can use a local placeholder URL, but database operations will fail until it points to a real PostgreSQL database.

Start the development server:

```sh
pnpm dev
```

The app is available at <http://localhost:3000> and the liveness endpoint at <http://localhost:3000/api/health>.

## 3. Configure Supabase Auth

Create or select a Supabase project. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the project's API settings. For the database, use the transaction pooler URL when appropriate; the Postgres.js client is configured with `prepare: false` for compatibility with Supabase transaction pooling.

In Supabase Auth URL configuration, add this redirect URL for local email confirmation:

```text
http://localhost:3000/auth/callback
```

For deployed environments, add the corresponding `${NEXT_PUBLIC_APP_URL}/auth/callback` URL. The app uses the publishable key and validates users through its server auth adapter. Never expose a Supabase service role key to the client.

## 4. Set up the database

Application tables are managed with Drizzle. Supabase Auth manages its own auth tables. Keep one migration source of truth for application tables: do not also create an independent Supabase migration history for those same tables.

From the repository root:

```sh
pnpm db:check
pnpm db:generate
pnpm db:migrate
```

`db:generate` creates migration files from `packages/db/src/schema` into `packages/db/drizzle`; review and commit those files. `db:migrate` applies committed migrations. `db:push` is available for local development, but do not use it as a production migration workflow. Use `pnpm db:seed` only against a database where seed data is appropriate. The database commands run in `packages/db` and read `DATABASE_URL` from `apps/web/.env.local`, so the project keeps one environment file.

## 5. Configure optional services

### Redis

Redis is optional. Set `REDIS_URL` to a TCP connection URL:

```dotenv
REDIS_URL=rediss://default:<password>@<host>:6379
```

Use `rediss://` for TLS connections such as Upstash and `redis://` for an unencrypted connection on a trusted network. Self-hosted Redis can use either scheme according to its TLS configuration. The app uses the standard Redis protocol and requires a Node.js runtime with outbound TCP access; this adapter is not for Edge runtimes that cannot open TCP connections.

When Redis is not configured, cache reads return a miss and `createRateLimiter()` falls back to an in-memory fixed window. Memory limits apply per server process, so configure Redis when you run several instances or serverless functions. Sign-in and sign-up attempts are limited to ten per minute per client address. Never commit a real Redis URL or password.

### Object storage

The storage adapter works with AWS S3 and S3-compatible providers such as Cloudflare R2 and MinIO. Configure `STORAGE_BUCKET`, `STORAGE_REGION`, `STORAGE_ENDPOINT` when required, and the access key, secret, and optional public URL. For R2, use the account's S3 API endpoint and region `auto`.

Projects can use Supabase Storage instead; `create-clubedge-app --storage supabase` selects that adapter.

The storage adapter does not authorize users or validate uploads. Before calling it, the route or action must check ownership and authorization, file size, content type, and the object key. Keep credentials server side.

## 6. Shared UI development

The repo uses matching `apps/web/components.json` and `packages/ui/components.json` files to direct the shadcn CLI into the shared `packages/ui` package. The selected `base-nova` style uses `@base-ui/react` primitives, not Radix UI. Tailwind CSS 4 and semantic theme tokens are defined in `packages/ui/src/styles/globals.css` and imported by the web app's root layout.

Generate a shared component from the repository root:

```sh
pnpm dlx shadcn@latest add badge -c apps/web
```

Shared components live in `packages/ui/src/components` and are imported from `@clubedge/ui/components/<component>`. Keep both `components.json` files aligned when changing the shadcn style, Tailwind CSS entry, base color, icon library, or RTL setting. The `rtl` setting makes newly generated components RTL-aware; set `lang` and `dir` on the root `<html>` element to match your application's actual locale. App-specific components belong in `apps/web/src/components`.

The root route is a public landing page; the reference dashboard is available at `/dashboard`. The dashboard uses the shared shadcn sidebar and breadcrumb. A light/dark switch is available in the landing page and dashboard navigation; its choice is saved in local storage and the initial theme follows the system preference until the user selects one. Theme colors are centralized in `packages/ui/src/styles/globals.css` (blue `#2563eb`, dark background `#151515`).

## 7. Docker

Create `apps/web/.env.local` first. Start the development image with:

```sh
pnpm docker:dev
```

Build a production image and run it with:

```sh
pnpm docker:build
pnpm docker:start
```

The Docker image uses Next.js standalone output and runs as an unprivileged user. Ensure the configured database and provider hosts are reachable from the container.

## 8. Checks

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

The Playwright configuration starts the local app with a placeholder database URL; browser scenarios should not require real provider credentials. Set `E2E_APP=start` to run the same suite against the TanStack Start app.

## 9. TanStack Start app

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

Run it with `pnpm --filter @clubedge/start dev`. The database commands still read `DATABASE_URL` from `apps/web/.env.local`. Build its image from the repository root:

```sh
docker build -f apps/start/Dockerfile --build-arg APP_DIR=apps/start --build-arg APP_PACKAGE=@clubedge/start -t clubedge-starter .
```

In projects generated with the TanStack Start option, the app lives in `apps/web`, its Dockerfile is the root `Dockerfile`, and the build arguments are not needed.

## Before deploying

This repository is a starting point; review the security and operational choices for your application before production use:

- Set production environment variables through your hosting provider's secret manager. Use unique, rotated credentials and TLS for external connections.
- Set `NEXT_PUBLIC_APP_URL` to the deployed origin and add its `/auth/callback` URL to Supabase's allowed redirect URLs.
- Make authenticated server routes call `getCurrentUser()` or `requireUser()` from `@/server/auth` (the latter throws a 401 `AppError`), and protect pages with `getPageUser(pathname)`, which redirects signed-out visitors to `/login`. Do not treat cookie contents alone as proof of identity.
- Authorize storage access and validate upload size, content type, and object ownership in the route or action before using the storage adapter.
- Configure Redis for rate limiting when you deploy more than one instance; the in-memory fallback does not share counts between instances. Client addresses come from `x-forwarded-for`, so deploy behind a proxy that sets it.
- Configure and verify a restrictive Content Security Policy for the scripts and asset origins used by your deployment. A generic policy is not included because it can break framework tooling and project-specific assets.
- Review database migration and backup procedures, provider access policies, and application-specific error handling.

## Troubleshooting

- **Environment validation fails:** confirm you copied the example to `apps/web/.env.local` and set `DATABASE_URL`.
- **Auth redirects fail:** add the exact local or deployed `/auth/callback` URL to Supabase Auth's allowed redirect URLs.
- **Database connection fails:** check the URL, network access, and whether your provider expects a transaction pooler. Keep `prepare: false` for the current Supabase pooler setup.
- **Redis cannot connect:** check that the URL uses `redis://` or `rediss://`, credentials are current, and outbound TCP access is allowed.
- **Playwright cannot find Chromium:** run `pnpm exec playwright install chromium`.
- **A package file appears missing after an offline install:** retry with a normal registry-backed `pnpm install`; an incomplete local package cache can satisfy offline resolution while leaving package contents incomplete.

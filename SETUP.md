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

The example file leaves provider URLs and keys blank so the app can build and start without connecting to real services. At minimum, set `DATABASE_URL`. The variables are:

- `DATABASE_URL` (required): PostgreSQL connection URL, such as a Supabase transaction pooler URL.
- `NEXT_PUBLIC_APP_URL` (recommended): the app's origin, defaulting to `http://localhost:3000`. <!-- clubedge:only framework=next -->
- `APP_URL` (recommended): the app's origin, defaulting to `http://localhost:3000`. <!-- clubedge:only framework=tanstack-start -->
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (for sign-in): see [Supabase Auth](#supabase-auth). <!-- clubedge:only framework=next && auth=supabase -->
- `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (for sign-in): see [Supabase Auth](#supabase-auth). <!-- clubedge:only framework=tanstack-start && auth=supabase -->
- `REDIS_URL` (optional): see [Redis](#redis). <!-- clubedge:only cache=redis -->
- `STORAGE_*` (for file storage): see [File storage](#file-storage). <!-- clubedge:only storage=s3 -->
- `SUPABASE_STORAGE_BUCKET` (for file storage): see [File storage](#file-storage). <!-- clubedge:only storage=supabase -->

`DATABASE_URL` must be a non-empty string for server environment validation. If you are only exploring the UI, a local placeholder URL works, but database operations fail until it points to a real PostgreSQL database.

Start the development server:

```sh
pnpm dev
```

The app is available at <http://localhost:3000> and the liveness endpoint at <http://localhost:3000/api/health>.

<!-- clubedge:if auth=supabase -->

## Supabase Auth

Create or select a Supabase project and copy its URL and publishable key from the project's API settings into the Supabase variables above. Authentication runs on the server, which validates every user with Supabase; never use a service role key.

In Supabase Auth URL configuration, add this redirect URL for local email confirmation:

```text
http://localhost:3000/auth/callback
```

For deployed environments, add your deployed origin followed by `/auth/callback`. Until the Supabase variables are set, the dashboard stays viewable as a demo and the login page explains what is missing; once they are set, the dashboard redirects signed-out visitors to the login page.

<!-- clubedge:end -->

## Set up the database

Application tables are managed with Drizzle. Keep one migration source of truth for application tables: do not also create an independent Supabase migration history for those same tables.

From the repository root:

```sh
pnpm db:check
pnpm db:generate
pnpm db:migrate
```

`db:generate` creates migration files from `packages/db/src/schema` into `packages/db/drizzle`; review and commit those files. `db:migrate` applies committed migrations. `db:push` is available for local development, but do not use it as a production migration workflow. Use `pnpm db:seed` only against a database where seed data is appropriate. The database commands run in `packages/db` and read `DATABASE_URL` from `apps/web/.env.local`, so the project keeps one environment file. The Postgres.js client is configured with `prepare: false` for compatibility with Supabase transaction pooling.

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

## Checks

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

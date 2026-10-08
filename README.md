# Clubedge Starter v1

A reference application foundation for Clubedge projects. This repository is the working starter itself; the `create-clubedge-app` generator and presets are deliberately a later step, after this architecture has been used by a real project.

## Included

- Next.js App Router, TypeScript, Tailwind CSS 4, and shadcn/ui configuration.
- Drizzle ORM with PostgreSQL, schema, migration commands, and seed script.
- Supabase Auth through cookie based `@supabase/ssr` clients. Application code uses `auth`, not SDK calls scattered across pages.
- Email and password sign-up/sign-in, sign-out action, and PKCE callback route.
- Storage interface with S3 compatible support (including Cloudflare R2) and a Supabase Storage adapter.
- Optional Upstash Redis cache and rate limiter.
- Zod environment checks, security headers, structured errors, and `/api/health`.
- Docker, GitHub Actions, Vitest, Playwright, ESLint, and Prettier configuration.

## Requirements

- Node.js 22.12 or later
- pnpm 10+
- A PostgreSQL database for database operations (Supabase PostgreSQL is the default target)

## Start locally

```sh
pnpm install
cp .env.example .env.local
```

Fill in `DATABASE_URL` and the Supabase URL and publishable key in `.env.local`. Then:

```sh
pnpm dev
```

Open <http://localhost:3000>. The dashboard and liveness endpoint work without connecting to external providers. Database, auth, storage, and Redis operations need their respective credentials. Redis is optional; cache calls return a cache miss when it is not configured.

For email confirmation, add `${NEXT_PUBLIC_APP_URL}/auth/callback` to the allowed redirect URLs in the Supabase Auth settings. The starter uses the project publishable key; do not add a service role key.

## Database

Application data uses Drizzle with PostgreSQL; Supabase Auth owns credentials and sessions. For Supabase's transaction pooler, `prepare: false` is set for the Postgres.js client.

```sh
pnpm db:generate   # generate migrations from src/db/schema
pnpm db:migrate    # apply checked-in migrations
pnpm db:push       # push schema directly (local development only)
pnpm db:studio
pnpm db:check
pnpm db:seed
```

Use one migration source of truth for app tables: Drizzle. Do not also create an independent Supabase migration history for the same application schema.

## Provider configuration

`STORAGE_PROVIDER` selects `s3` (the default) or `supabase`. S3 configuration works with AWS S3 or any compatible endpoint such as Cloudflare R2. The storage API is server only; validate upload authorization, file size, content type, and object key ownership in the calling route or action before using it. Signed read URLs are short lived by default.

Upstash Redis is enabled only when both `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set. `createRateLimiter()` returns `null` when Redis is absent so endpoints can choose an explicit local/development policy rather than silently claiming distributed rate limiting is active.

## Commands

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
pnpm format:check
```

Playwright starts the local app with a placeholder `DATABASE_URL`; the browser scenario does not connect to the database. Install a Playwright browser once with `pnpm exec playwright install chromium` if needed.

## Docker

After creating `.env.local`, run `pnpm docker:dev`. `pnpm docker:build` creates the production image, and `pnpm docker:start` runs it. The image uses Next.js standalone output and runs as an unprivileged user.

## Layout

```text
src/
  app/                 App Router pages and route handlers
  db/                  Drizzle connection and schema
  env/                 Server and browser environment validation
  lib/auth/            Auth provider boundary and Supabase SSR adapter
  lib/cache/            Optional Redis cache and rate limiter
  lib/errors/           Safe, structured application errors
  lib/storage/          Storage provider interface and adapters
drizzle/                Generated SQL migrations
scripts/                Database migration and seed commands
```

## Security notes

- Keep `.env.local` out of source control. Never expose a Supabase service role key to a browser bundle.
- Authenticated routes must call `auth.getUser()` / `requireUser()` on the server. Do not trust session data read only from cookies; `getUser()` validates with Supabase.
- The health route is a liveness check and does not disclose provider credentials or connection details.
- Configure a restrictive Content Security Policy for each deployment once the app's scripts and asset origins are known. A generic CSP can break framework development tooling, so it is not guessed here.
- Storage adapter methods do not replace application authorization or upload validation.

## Roadmap

This v1 reference keeps the core small. Cloudinary, email, observability, AI, jobs, feature flags, project presets, an interactive CLI, and starter upgrade tooling belong in later releases after this baseline is validated in a real application.

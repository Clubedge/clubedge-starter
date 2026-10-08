# Clubedge Starter v1

A reference application foundation for Clubedge projects. This repository is the working starter itself; the `create-clubedge-app` generator and presets are deliberately a later step, after this architecture has been used by a real project.

## Included

- pnpm workspace monorepo with a Next.js app in `apps/web` and shared shadcn/ui source in `packages/ui`.
- TypeScript, Tailwind CSS 4, RTL-aware shadcn/ui configuration, and reusable shared components.
- Drizzle ORM with PostgreSQL, schema, migration commands, and seed script.
- Supabase Auth through cookie based `@supabase/ssr` clients. Application code uses `auth`, not SDK calls scattered across pages.
- Email and password sign-up/sign-in, sign-out action, and PKCE callback route.
- Storage interface with S3 compatible support (including Cloudflare R2) and a Supabase Storage adapter.
- Optional Redis cache and rate limiter over the standard Redis protocol (Upstash or self-hosted).
- Zod environment checks, security headers, structured errors, and `/api/health`.
- Docker, GitHub Actions, Vitest, Playwright, ESLint, and Prettier configuration.

## Requirements

- Node.js 22.12 or later
- pnpm 10+
- A PostgreSQL database for database operations (Supabase PostgreSQL is the default target)

## Start locally

```sh
pnpm install
cp .env.example apps/web/.env.local
```

Fill in `DATABASE_URL` and the Supabase URL and publishable key in `.env.local`. Then:

```sh
pnpm dev
```

Open <http://localhost:3000>. The dashboard and liveness endpoint work without connecting to external providers. Database, auth, storage, and Redis operations need their respective credentials. Redis is optional; cache calls return a cache miss when it is not configured.

For email confirmation, add `${NEXT_PUBLIC_APP_URL}/auth/callback` to the allowed redirect URLs in the Supabase Auth settings. The starter uses the project publishable key; do not add a service role key.

## Database

Application data uses Drizzle with PostgreSQL; Supabase Auth owns credentials and sessions. For Supabase's transaction pooler, `prepare: false` is set for the Postgres.js client. Run database commands from the repository root; the scripts execute in the `apps/web` workspace.

```sh
pnpm db:generate   # generate migrations from apps/web/src/db/schema
pnpm db:migrate    # apply checked-in migrations
pnpm db:push       # push schema directly (local development only)
pnpm db:studio
pnpm db:check
pnpm db:seed
```

Use one migration source of truth for app tables: Drizzle. Do not also create an independent Supabase migration history for the same application schema.

## Provider configuration

`STORAGE_PROVIDER` selects `s3` (the default) or `supabase`. S3 configuration works with AWS S3 or any compatible endpoint such as Cloudflare R2. The storage API is server only; validate upload authorization, file size, content type, and object key ownership in the calling route or action before using it. Signed read URLs are short lived by default.

Redis uses a normal TCP connection, enabled by `REDIS_URL`. For Upstash, copy the TLS connection URL (`rediss://...`) from its console; self-hosted Redis can use `redis://...` or `rediss://...`. The same `redis` client handles both. This requires a Node.js runtime and network access to the Redis host; it is not for Edge runtimes where outbound TCP is unavailable. The starter uses Redis `INCR` and `PEXPIRE` in one Lua script for an atomic fixed-window rate limit. `createRateLimiter()` returns `null` when `REDIS_URL` is absent so endpoints can choose an explicit local/development policy instead of silently claiming distributed rate limiting is active.

```ts
const limiter = createRateLimiter(20, 60); // 20 requests per 60 seconds
const result = await limiter?.limit(userId);
if (result && !result.success) {
  return Response.json({ error: "Too many requests" }, { status: 429 });
}
```

## Commands

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
pnpm format:check
```

The Playwright configuration points to `apps/web/e2e` and starts the web workspace. Install a Playwright browser once with `pnpm exec playwright install chromium` if you choose to run the browser checks.

## Shared UI

The repository is a pnpm workspace. `apps/web` is the Next.js application and `packages/ui` owns shared shadcn/ui components, utilities, and theme styles. The two `components.json` files stay aligned so the shadcn CLI can route shared components into the UI package.

Add components from the repository root, targeting the web app configuration:

```sh
pnpm dlx shadcn@latest add card -c apps/web
```

The generated shared component can then be imported from `@clubedge/ui/components/card`. Add app-specific components under `apps/web/src/components`. The starter uses the neutral `new-york` component style, Lucide icons, and RTL-aware generation. To customize colors, typography, or other preset settings, create a complete preset code with shadcn/create and apply it deliberately; the abbreviated `b0` value is not included as a preset.

## Docker

After creating `apps/web/.env.local`, run `pnpm docker:dev`. `pnpm docker:build` creates the production image, and `pnpm docker:start` runs it. The image uses Next.js standalone output and runs as an unprivileged user.

## Layout

```text
apps/web/src/
  app/                  App Router pages and route handlers
  db/                   Drizzle connection and schema
  env/                  Server and browser environment validation
  lib/auth/              Auth provider boundary and Supabase SSR adapter
  lib/cache/             Optional Redis cache and rate limiter
  lib/errors/            Safe, structured application errors
  lib/storage/           Storage provider interface and adapters
apps/web/drizzle/        Generated SQL migrations
apps/web/scripts/        Database migration and seed commands
packages/ui/src/
  components/            Shared shadcn/ui components
  lib/                   Shared UI utilities
  styles/                Shared Tailwind theme and global CSS
```

## Security notes

- Keep `.env.local` out of source control. Never expose a Supabase service role key to a browser bundle.
- Authenticated routes must call `auth.getUser()` / `requireUser()` on the server. Do not trust session data read only from cookies; `getUser()` validates with Supabase.
- The health route is a liveness check and does not disclose provider credentials or connection details.
- Configure a restrictive Content Security Policy for each deployment once the app's scripts and asset origins are known. A generic CSP can break framework development tooling, so it is not guessed here.
- Storage adapter methods do not replace application authorization or upload validation.

## Roadmap

This v1 reference keeps the core small. Cloudinary, email, observability, AI, jobs, feature flags, project presets, an interactive CLI, and starter upgrade tooling belong in later releases after this baseline is validated in a real application.

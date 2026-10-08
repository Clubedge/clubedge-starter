# Clubedge Starter

[![CI](https://github.com/yassine-ahmed/clubedge-starter/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/yassine-ahmed/clubedge-starter/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)

Clubedge Starter is an open source foundation for building full stack web applications with Next.js. It provides a pnpm monorepo, a shared shadcn/ui component package, PostgreSQL access through Drizzle, Supabase Auth, optional Redis and storage adapters, and a working example dashboard.

This is a starter, not a hosted service or a one-command app generator. Fork it or use it as a reference, then adapt the app and provider configuration to your project. Contributions and bug reports are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md). Repository maintainers can use [PUBLISHING.md](PUBLISHING.md) for the GitHub launch checklist.

## Features

- Next.js App Router, React, TypeScript, Tailwind CSS 4, and shadcn/ui.
- pnpm workspaces and Turborepo, with the web app in `apps/web` and reusable UI source in `packages/ui`.
- Drizzle ORM and PostgreSQL schema, migrations, and seed commands.
- Supabase Auth using cookie based server clients from `@supabase/ssr`.
- S3 compatible storage (including Cloudflare R2) and Supabase Storage adapters.
- Optional Redis cache and fixed-window rate limiter using a standard Redis URL.
- Zod environment validation, security headers, structured errors, and `/api/health`.
- Docker support, GitHub Actions CI, Vitest, Playwright, ESLint, and Prettier.

## Quick start

### Requirements

- Node.js 22.12 or newer (Node.js 22 LTS recommended).
- pnpm 10.9.0. The repository pins its package manager version using Corepack.
- PostgreSQL when using database features. A Supabase project can provide both PostgreSQL and Auth.

### Install and run

```sh
corepack enable
pnpm install
```

Copy the example environment file to the web app's local environment file.

PowerShell:

```powershell
Copy-Item .env.example apps/web/.env.local
```

macOS/Linux:

```sh
cp .env.example apps/web/.env.local
```

Set `DATABASE_URL` in `apps/web/.env.local`. Supabase Auth is optional for exploring the UI; set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to enable it. See [SETUP.md](SETUP.md) for provider setup and optional integrations. Then start the app:

```sh
pnpm dev
```

Open <http://localhost:3000>. The example dashboard and `/api/health` liveness endpoint can render without connecting to providers. Database, authentication, storage, and Redis operations require their respective configuration.

## Common commands

Run these from the repository root:

| Command             | Purpose                                        |
| ------------------- | ---------------------------------------------- |
| `pnpm dev`          | Start the web app in development mode.         |
| `pnpm build`        | Create a production build.                     |
| `pnpm start`        | Start the standalone production build.         |
| `pnpm lint`         | Run ESLint.                                    |
| `pnpm typecheck`    | Typecheck the workspaces.                      |
| `pnpm test`         | Run Vitest.                                    |
| `pnpm test:e2e`     | Run Playwright browser checks.                 |
| `pnpm format`       | Format supported repository files.             |
| `pnpm format:check` | Check formatting without writing files.        |
| `pnpm db:generate`  | Generate Drizzle migrations from the schema.   |
| `pnpm db:migrate`   | Apply checked-in Drizzle migrations.           |
| `pnpm db:push`      | Push schema directly (local development only). |
| `pnpm db:studio`    | Open Drizzle Studio.                           |
| `pnpm db:check`     | Check migration consistency.                   |
| `pnpm db:seed`      | Seed the configured database.                  |

Playwright's first run may require installing Chromium with `pnpm exec playwright install chromium`. CI runs the browser checks automatically.

## Repository structure

```text
apps/web/       Next.js app, API routes, database schema, and app-specific code
packages/ui/    Shared shadcn/ui components, utilities, and global theme styles
.github/        CI workflow, issue forms, and pull request template
SETUP.md        Detailed local and provider setup
CONTRIBUTING.md Contribution workflow and review expectations
SECURITY.md     Vulnerability reporting guidance
```

## Shared UI components

The shared component package is `@clubedge/ui`. Add a shadcn/ui component from the repository root using the web app's config:

```sh
pnpm dlx shadcn@latest add accordion -c apps/web
```

Shared components are generated under `packages/ui/src/components` and can be imported from `@clubedge/ui/components/<component>`. Keep `apps/web/components.json` and `packages/ui/components.json` aligned when changing shadcn/ui style, base color, icon library, or Tailwind CSS settings. Put app-only components in `apps/web/src/components`.

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening an issue or pull request. For local changes, run the relevant checks before submitting. You can report vulnerabilities privately using the process in [SECURITY.md](SECURITY.md).

## License

Copyright © 2026 Clubedge Digital Systems. This project is licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

# Roadmap

This roadmap describes the Starter's phases since v0.5.0, and the work proposed next. The command-line side of the same phases lives in the [create-clubedge-app roadmap](https://github.com/Clubedge/create-clubedge-app/blob/main/ROADMAP.md). Phases are delivered in order, and each one ends with a Starter release and a CLI release pinned to it.

Every phase follows the rules the existing modules already follow:

- A module is optional, described in `clubedge/modules/`, and removed completely when it is left out: its packages, provider SDKs, environment variables, documentation, and lockfile entries.
- Provider SDKs live in their own package behind an interface in a provider-neutral package, and each app's `src/server/` is the composition root.
- Every stack gets the same behavior: the web apps share their browser tests, and the APIs pass the same conformance suite.
- Local development works with `--infra docker`, `--infra supabase`, `--infra local`, and `--infra neon` where the provider allows it, and `pnpm check:services` covers the new service.
- `starter.yml` generates projects for the new combinations and runs their full pipeline, including a real end-to-end flow against local services.

## Done

| Phase   | Release            | What it delivered                                                                                                                  |
| ------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| 4       | v0.5.0             | Optional modules (template schema 3), Better Auth, one package per provider                                                        |
| 5.1     | v0.6.0             | Local infrastructure: Docker Compose, the Supabase CLI stack, `pnpm check:services`                                                |
| 5.2     | v0.7.0             | No-Docker local mode: PGlite served over the PostgreSQL protocol, local folder storage                                             |
| 5.3–5.4 | CLI 0.8.0          | `add`, `remove`, and `upgrade` with a three-way merge (CLI only)                                                                   |
| 6       | v0.8.0             | `pnpm clubedge` script, Windows unit tests                                                                                         |
| 7       | v0.9.0             | Email (SMTP, Resend), password reset, optional email verification, local inboxes                                                   |
| 8       | v0.10.0            | Deployment: Docker, Fly.io, Railway, Render, Vercel, Netlify, and a built-in migrator                                              |
| 9       | v0.11.0            | Payments: Stripe Checkout, the customer portal, webhook-synced subscriptions                                                       |
| 10.1    | v0.12.0            | Background jobs with pg-boss, run by a worker inside the app server or by a scheduler on serverless hosts                          |
| 10.2    | v0.13.0            | Observability with OpenTelemetry or Sentry, behind dependency-free hooks in `@clubedge/core`                                       |
| 11      | v0.14.0            | Account settings, browser error reporting and Sentry source maps, auth emails through the jobs queue                               |
| 12      | v0.15.0            | A docs-style dashboard: a sidebar with a section switcher and an account card, and a drawer on phones                              |
| 13      | v0.16.0 to v0.18.0 | Upgrades delivered as pull requests, Railway configuration as code, and builds that stop on a missing production variable          |
| 14      | v0.19.0            | Neon: a free database with `--infra neon`, and a Neon branch for each pull request's preview                                       |
| 15      | v0.20.0 to v0.21.0 | Pluggable providers: BullMQ and Inngest jobs, Firebase and Appwrite auth, each with a conformance suite every provider passes      |
| 16      | v0.22.0 to v0.26.0 | Stack packs (template schema 4), and React + Vite with a separate Hono or FastAPI API, with every module on both                   |
| 17      | v0.27.0            | Mobile apps with Capacitor (template schema 5), client addresses per platform, and Docker Compose behind Caddy with images on GHCR |
| 18      | v0.28.0            | The native app with Expo (template schema 6), and projects without a website: an API, with or without the native app               |

## Next

These are the candidates for the next phases, in the order proposed. The order is not settled yet.

- **Organizations and teams:** workspaces, members, roles (owner, admin, member), email invitations, and an active-organization switcher, with data and billing per organization, across the web apps, the API contract, and the native app. Better Auth has an organizations plugin; Supabase would use tables and row-level security; Appwrite has Teams.
- **Mobile, part 3: shipping to stores:** push notifications (a `notifications` module, with Expo's push service for the native app), store builds through EAS Build, over-the-air updates, and Firebase and Appwrite sign-in in the native app.
- **An admin area:** a user list, roles, banning users, and impersonating a user for support, built on the roles of organizations and teams.

Later options: an AI module (language model providers behind one interface, with streaming), internationalization, and product analytics with feature flags.

## Ongoing

- Keep framework and provider dependencies current (Next.js, TanStack Start, Vite, Hono, FastAPI, Expo, Better Auth, Drizzle, PGlite), with each update going through the full `starter.yml` matrix.
- Keep `pnpm check:services` and the local-infra jobs covering every service the Starter can use.
- Every new module must survive `add`, `remove`, and `upgrade`: the CLI's change-modules and upgrade-project jobs exercise them, so blocks in code stay additive and variants stay in `variants/`.

# Stability and compatibility

A project made with Clubedge Starter is yours to change from its first commit, and it keeps taking
the Starter's improvements through `pnpm clubedge upgrade`. This page says what stays compatible
from one release to the next, how ready each module option is, how an option is retired, and what
an upgrade promises.

## What is versioned

Four things change at their own pace, and each has its own promise.

| What                                                        | Example      | Promise                                                                                                                                                                                       |
| ----------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Starter releases                                            | `v0.31.3`    | A patch release only fixes. Before 1.0, a minor release may change generated code in ways that need you; its notes say how. From 1.0, only a major release does.                              |
| Template schema                                             | `6`          | The format of `clubedge.template.json` and its descriptors. It changes only when that format does, never just because the Starter has a release. Every CLI reads every schema before its own. |
| CLI (`@clubedge/create-clubedge-app`)                       | `0.48.2`     | Each release creates and upgrades to one Starter release, its pin. It upgrades projects made with any earlier release, from the first one.                                                    |
| Project record (`clubedge` in `package.json`, `.clubedge/`) | `starterRef` | Written by the CLI. A newer CLI reads what an older one wrote, so a project never needs to be made again.                                                                                     |

A schema change ships with a CLI that reads it, and the
[upgrade matrix](https://starter.clubedge.live/upgrades) upgrades the oldest release of each
schema to the newest every week and after every CLI release.

## Support levels

Every module option and stack has a level, earned from what CI runs on `main`, not from promises.

| Level        | Meaning                                                                                                                                      |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Stable       | Runs end to end in CI against the real service, its own local stack or emulator, or in production in one of the case studies.                |
| Beta         | Generated projects build and test with it in CI, but it does not run end to end against the real service yet. Its note says what is missing. |
| Experimental | Generated and checked, or dry-run, only. Its note says what has not run yet.                                                                 |
| Deprecated   | Still works and still upgrades, but new projects should choose its replacement. See [Deprecation](#deprecation).                             |

The level and its note live in the option's descriptor (`clubedge/modules/<id>.json`, or a stack's
`clubedge.stack.json`). The CLI warns when a project chooses an option below Stable, the MCP server
returns the level with each option, and the builder on the website shows it. An option moves up
when the missing evidence lands in CI, and down when that evidence stops passing.

<!-- The checks in scripts/stability.test.ts keep this table and the descriptors in step. -->

| Part            | Option           | Level        | Evidence                                                                                                                       |
| --------------- | ---------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `stack`         | `next`           | Stable       | Generated projects build, test, and run every flow against local services (`generated-project`, `local-infra`).                |
| `stack`         | `tanstack-start` | Stable       | Generated projects build, test, and run every flow against local services (`generated-project`, `local-infra`).                |
| `stack`         | `vite`           | Stable       | Generated projects build, test, and run every flow against local services (`generated-project`, `local-infra`).                |
| `stack`         | `hono`           | Stable       | Every flow against local services, behind React + Vite and without a website (`local-infra`, `generated-project`).             |
| `stack`         | `fastapi`        | Stable       | Every flow against local services, behind React + Vite and without a website (`local-infra`, `generated-project`).             |
| `stack`         | `capacitor`      | Stable       | The Android app is walked through on an emulator for every pull request (`starter-mobile`); iOS builds weekly (`starter-ios`). |
| `stack`         | `expo`           | Stable       | The Android app is walked through on an emulator for every pull request (`starter-mobile`); iOS builds weekly (`starter-ios`). |
| `auth`          | `supabase`       | Stable       | Sign-up, sign-in, password reset, and the auth conformance suite against the local Supabase stack (`local-infra`).             |
| `auth`          | `better-auth`    | Stable       | Sign-up, sign-in, email confirmation, and password reset with every framework and API (`local-infra`, `better-auth-flow`).     |
| `auth`          | `firebase`       | Stable       | Sign-in against the Firebase Auth Emulator with both APIs (`firebase-flow`, `local-infra`).                                    |
| `auth`          | `appwrite`       | Beta         | The auth conformance suite against Appwrite Cloud (`appwrite`); no browser flow signs in through it yet.                       |
| `cache`         | `redis`          | Stable       | Every Docker `local-infra` run uses Redis, and `check:services` writes and reads it.                                           |
| `cache`         | `memory`         | Stable       | In the app's own process, in every generated project's tests.                                                                  |
| `deploy`        | `docker`         | Stable       | The production images build, run their migrations, and answer health checks in CI; Chess's API runs in one in production.      |
| `deploy`        | `fly`            | Beta         | `deploy-config` checks `fly.toml` and the deploy workflow; no deploy has run with it yet.                                      |
| `deploy`        | `railway`        | Beta         | `deploy-config` checks the Railway config and the deploy workflow; no deploy has run with it yet.                              |
| `deploy`        | `render`         | Beta         | `deploy-config` checks `render.yaml` and the deploy workflow; no deploy has run with it yet.                                   |
| `deploy`        | `vercel`         | Stable       | `deploy-config` checks the config and builds TanStack Start with Vercel's preset; Chat App runs on it in production.           |
| `deploy`        | `netlify`        | Beta         | `deploy-config` checks the config and builds TanStack Start with Netlify's preset; no deploy has run with it yet.              |
| `deploy`        | `cloudflare`     | Experimental | `deploy-config` dry-runs both configurations with Wrangler; nothing has been deployed with it yet.                             |
| `email`         | `smtp`           | Stable       | Password reset and email confirmation read their email from the inbox (`local-infra`).                                         |
| `email`         | `resend`         | Beta         | Generated projects build and test with it; no email is sent through Resend in CI.                                              |
| `infra`         | `docker`         | Stable       | `local-infra` starts it and runs every flow against it.                                                                        |
| `infra`         | `supabase`       | Stable       | `local-infra` starts the local Supabase stack and runs every flow against it.                                                  |
| `infra`         | `local`          | Stable       | `local-infra` runs every flow without Docker, then restarts the database and keeps its data.                                   |
| `infra`         | `neon`           | Stable       | `local-infra` runs every flow against a real Neon branch.                                                                      |
| `jobs`          | `pg-boss`        | Stable       | A background job runs end to end on PostgreSQL (`local-infra`).                                                                |
| `jobs`          | `bullmq`         | Stable       | A background job runs end to end on Redis (`local-infra`).                                                                     |
| `jobs`          | `inngest`        | Beta         | A background job runs end to end through the Inngest Dev Server, not Inngest Cloud (`local-infra`).                            |
| `observability` | `otel`           | Beta         | A request's traces reach a stand-in OTLP collector (`local-infra`).                                                            |
| `observability` | `sentry`         | Beta         | A request's traces reach a stand-in for Sentry's API (`local-infra`).                                                          |
| `ota`           | `eas`            | Beta         | The native app builds with EAS Update configured (`generated-project`); no update is published.                                |
| `payments`      | `stripe`         | Beta         | Checkout, the webhook, and the billing portal against a stand-in for Stripe's API (`local-infra`).                             |
| `push`          | `expo`           | Beta         | The apps build with it and sending is unit-tested; no notification is delivered in CI.                                         |
| `push`          | `native`         | Beta         | The apps build with it and sending is unit-tested; nothing is delivered through FCM or APNs in CI.                             |
| `storage`       | `s3`             | Stable       | `check:services` uploads, reads back, and deletes an object on a local S3-compatible server.                                   |
| `storage`       | `supabase`       | Stable       | `check:services` makes the same round trip on the local Supabase stack.                                                        |

The `none` options, which leave a module out, are not graded.

A new option or stack starts at the level its CI earns: usually Beta, when generated projects
build and test with it but nothing runs end to end against the real service, or Experimental,
when it is only generated or dry-run. Raise it in the pull request that adds the missing evidence
to CI, and update its row above: `pnpm test` fails while this table and the descriptors disagree.

## Deprecation

An option is retired in stages, so no project loses a module it uses in an ordinary upgrade.

1. **Deprecated.** Its descriptor says `"status": "deprecated"`, the release it happened in
   (`since`), and the option to use instead (`replacement`). It keeps its fixes and keeps
   upgrading. The CLI warns when a project chooses it, and when a project that has it upgrades,
   with the command that moves to the replacement:
   `pnpm clubedge add <module> <replacement>`.
2. **No longer offered.** At least two minor releases and three months later, its descriptor adds
   `"offered": false`: new projects, and `pnpm clubedge add`, can no longer choose it. Projects
   that have it keep upgrading with it.
3. **Removed.** A release removes it from the Starter only after its notes announced the removal
   one release ahead, and, from 1.0, only in a major release. Its module's descriptor keeps it
   under `removed`, with `since` and `replacement`, so an upgrade to that release stops before
   changing anything when the project still has the option, and names the replacement.

Removing a module you chose is always your command, `pnpm clubedge remove`: an upgrade never does
it for you.

## What an upgrade promises

`pnpm clubedge upgrade` merges the newer Starter into your project three ways: what the Starter
gave you, what you made of it, and what the Starter gives now.

- Files you never changed take the new version. Files you changed keep your edits, merged with the
  Starter's.
- Where both sides changed the same lines, it writes conflict markers, as Git does, lists the
  files, and saves the Starter's version under `.clubedge/incoming`. It never picks a side
  silently.
- It refuses to run on a project that still has unresolved conflict markers.
- `--dry-run` shows every change first, and nothing is written until you run it without.
- Dependencies you raised past the Starter's keep your version.

It does not promise an upgrade without conflicts: you can change anything, so the Starter cannot
know every edit. It promises to show you each one. The [upgrade matrix](https://starter.clubedge.live/upgrades)
publishes how upgrades from each starting release went, with no edits, after `pnpm up`, with a
`pnpm patch`, and with feature edits.

## Long-term support

Version 1.0 will be the first long-term support (LTS) release. For 12 months after its release,
its line receives security fixes, fixes for critical bugs, and dependency updates that need no
change from you, and no new features. Later LTS releases are announced with their support window.

## Before 1.0

The Starter becomes 1.0 when:

- every option has a level, and the CLI, the MCP server, and the builder show it;
- this policy is published, and the CLI enforces its deprecation stages;
- the CLI reports upgrades in a machine-readable form, for tools that maintain many projects;
- the upgrade matrix stays green for four weekly runs in a row;
- no template schema change is planned for the 1.x line.

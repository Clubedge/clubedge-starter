# Contributing

Thanks for helping improve Clubedge Starter. Contributions of code, documentation, bug reports, and focused feature proposals are welcome.

## Before you start

- Check existing issues and pull requests for related work.
- For a large or user-visible change, open an issue first so we can agree on the scope.
- For security concerns, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.
- Keep pull requests focused. Explain the problem, the change, and any setup or migration impact.

## Development setup

Follow [SETUP.md](SETUP.md) to install dependencies and configure local services. Most changes can be checked with:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
pnpm build
```

Run `pnpm test:e2e` for changes that affect browser behavior. It requires a locally installed Playwright browser. CI runs the full configured verification workflow for pull requests.

## Contribution workflow

1. Fork the repository and create a focused branch from `main`.
2. Make the change and add or update coverage and documentation where appropriate.
3. Run the checks relevant to the change and review `git diff` for secrets or generated output.
4. Open a pull request against `main`, describe the user impact, and link the related issue when there is one.
5. Respond to review feedback; maintainers will use the pull request checks and discussion to decide when the change is ready to merge.

## Project conventions

- Keep application code in `apps/web` and reusable shadcn/ui code in `packages/ui`.
- Use the existing auth, storage, cache, errors, and database boundaries rather than scattering provider SDK calls through routes and components.
- Keep server secrets out of client code and out of committed files. Update `.env.example` when adding configuration, using placeholders only.
- For database changes, update the Drizzle schema and generate, review, and commit the migration. Do not maintain a second migration history for the same application tables.
- For shared UI changes, preserve compatibility between both `components.json` files and use the established package exports.
- Update docs when commands, configuration, or behavior change.
- Follow the existing formatting and TypeScript conventions. Prefer a small dependency footprint and explain new runtime dependencies in the pull request.

## Pull request checklist

- [ ] The change addresses an issue or clearly explains its motivation.
- [ ] Documentation and `.env.example` are updated when needed.
- [ ] Database migrations are included and reviewed when schema changes.
- [ ] Relevant lint, typecheck, unit, formatting, and build checks pass locally.
- [ ] No credentials, generated build output, or unrelated changes are included.

By submitting a contribution for inclusion, you agree that it will be distributed under the repository's [Apache License, Version 2.0](LICENSE), consistent with section 5 of that license. No separate contributor license agreement is currently required.

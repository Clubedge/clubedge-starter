# GitHub launch checklist

This checklist is for repository maintainers preparing `clubedge-starter` for public use. The code changes alone cannot change GitHub repository visibility or security settings.

## Before changing visibility

- [ ] Review the [README](README.md), [setup guide](SETUP.md), [Apache-2.0 license](LICENSE), and [NOTICE](NOTICE).
- [ ] Confirm `.env.local`, provider credentials, database dumps, and generated build output are not tracked. Only placeholder values belong in `.env.example`.
- [ ] Search the full Git history for credentials before making the repository public. Rotating a leaked credential does not remove it from history.
- [ ] Confirm the existing CI workflow passes on GitHub Actions for `main` and a pull request.
- [ ] Set a concise repository description and useful topics such as `nextjs`, `shadcn-ui`, `pnpm`, `drizzle-orm`, `supabase`, and `starter-kit`.

## Recommended GitHub settings

- [ ] Change repository visibility to **Public** when the owner is ready to publish it.
- [ ] Enable private vulnerability reporting under **Settings → Security** so the SECURITY.md reporting link works.
- [ ] Protect `main` with pull requests and require the CI workflow to pass before merging.
- [ ] Keep repository permissions least-privileged and grant write access only to trusted maintainers.
- [ ] Decide whether to enable Discussions for support and design proposals; current support instructions use issues and pull requests.
- [ ] Add maintainers to `CODEOWNERS` only if review requests should be assigned automatically.

## After publication

- [ ] Open the public README and setup links while signed out to confirm they are accessible.
- [ ] Verify the Actions badge and issue forms render correctly.
- [ ] Confirm the private vulnerability reporting path is available and points to the right repository.
- [ ] Announce the project with a clear note that it is a community starter and that adopters must review deployment security and provider policies.

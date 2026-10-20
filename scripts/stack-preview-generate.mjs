#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const workspace = process.env.GITHUB_WORKSPACE;
const api = process.env.API_KIND;
const auth = process.env.AUTH_KIND;
const pr = process.env.PR_NUMBER;

if (process.env.GITHUB_ACTIONS !== "true" || !workspace) {
  throw new Error("This script must run inside a GitHub Actions checkout.");
}
if (!new Set(["hono", "fastapi"]).has(api)) throw new Error("API_KIND must be hono or fastapi.");
if (!pr || !/^\d+$/.test(pr)) throw new Error("PR_NUMBER must be a pull request number.");
if (!new Set(["none", "supabase"]).has(auth))
  throw new Error("AUTH_KIND must be none or supabase.");

const branch = `stack-preview/pr-${pr}-${api}`;
const destination = await mkdtemp(join(tmpdir(), `clubedge-${api}-`));
const project = join(destination, "project");
const publisher = join(destination, "publisher");
const run = (command, args, options = {}) =>
  execFileSync(command, args, { cwd: workspace, stdio: "inherit", ...options });
let publisherCreated = false;

try {
  run("pnpm", [
    "dlx",
    "@clubedge/create-clubedge-app@0.34.0",
    project,
    "--template-dir",
    workspace,
    "--framework",
    "vite",
    "--api",
    api,
    "--auth",
    auth,
    "--infra",
    "neon",
    "--deploy",
    "docker",
    "--no-neon",
    "--no-install",
    "--no-git",
    "--yes",
  ]);

  // The CLI can update tracked files in the Starter checkout while using --template-dir.
  // Publish from a clean worktree so those generation changes don't block orphan-branch creation.
  run("git", ["worktree", "add", "--detach", publisher, "HEAD"]);
  publisherCreated = true;
  const publish = (args) => run("git", args, { cwd: publisher });
  publish(["switch", "--orphan", branch]);
  for (const entry of await readdir(publisher)) {
    if (entry !== ".git") await rm(join(publisher, entry), { recursive: true, force: true });
  }
  await cp(project, publisher, { recursive: true, force: true });
  // The GITHUB_TOKEN cannot publish workflow files without the elevated `workflows` permission.
  // Preview services only need the generated application source, so omit the project's CI/deploy workflows.
  await rm(join(publisher, ".github", "workflows"), { recursive: true, force: true });
  publish(["add", "-A"]);
  publish(["config", "user.name", "github-actions[bot]"]);
  publish(["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
  publish(["commit", "-m", `chore: generate ${api} ${auth} preview for PR #${pr}`]);
  const commit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: publisher,
    encoding: "utf8",
  }).trim();
  publish(["push", "--force", "origin", `HEAD:refs/heads/${branch}`]);

  if (process.env.GITHUB_OUTPUT) {
    const fs = await import("node:fs/promises");
    await fs.appendFile(process.env.GITHUB_OUTPUT, `branch=${branch}\ncommit=${commit}\n`);
  }
  console.log(`Published ${api} with ${auth} auth to ${branch}.`);
} finally {
  if (publisherCreated) {
    try {
      execFileSync("git", ["worktree", "remove", "--force", publisher], {
        cwd: workspace,
        stdio: "ignore",
      });
    } catch {
      // The GitHub Actions checkout is disposable; cleanup failure must not hide the real error.
    }
  }
  await rm(destination, { recursive: true, force: true });
}

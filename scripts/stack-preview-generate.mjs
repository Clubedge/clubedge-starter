#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { cp, mkdtemp, rm } from "node:fs/promises";
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
const run = (command, args, options = {}) =>
  execFileSync(command, args, { cwd: workspace, stdio: "inherit", ...options });

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

  // This runner is disposable. Replace its checkout with the generated project and publish it
  // on a PR-specific branch for Render to build. Each matrix job has a distinct branch.
  run("git", ["switch", "--orphan", branch]);
  run("git", ["rm", "-rf", "."]);
  await cp(project, workspace, { recursive: true, force: true });
  run("git", ["add", "-A"]);
  run("git", ["config", "user.name", "github-actions[bot]"]);
  run("git", ["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
  run("git", ["commit", "-m", `chore: generate ${api} ${auth} preview for PR #${pr}`]);
  run("git", ["push", "--force", "origin", `HEAD:refs/heads/${branch}`]);

  if (process.env.GITHUB_OUTPUT) {
    const fs = await import("node:fs/promises");
    await fs.appendFile(process.env.GITHUB_OUTPUT, `branch=${branch}\n`);
  }
  console.log(`Published ${api} with ${auth} auth to ${branch}.`);
} finally {
  await rm(destination, { recursive: true, force: true });
}

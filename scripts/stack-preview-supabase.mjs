#!/usr/bin/env node

import { appendFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const [action] = process.argv.slice(2);
const projectRef = process.env.SUPABASE_PROJECT_REF;
const branch = process.env.SUPABASE_BRANCH;

if (!new Set(["ensure", "delete"]).has(action)) {
  throw new Error("Usage: node scripts/stack-preview-supabase.mjs <ensure|delete>");
}
if (!projectRef || !branch || !process.env.SUPABASE_ACCESS_TOKEN) {
  throw new Error("SUPABASE_PROJECT_REF, SUPABASE_BRANCH, and SUPABASE_ACCESS_TOKEN are required.");
}

function cli(args, { allowFailure = false } = {}) {
  const result = spawnSync("supabase", ["--experimental", ...args], {
    encoding: "utf8",
    env: process.env,
  });
  if (result.status !== 0 && !allowFailure) {
    throw new Error(result.stderr || result.stdout || `Supabase CLI exited with ${result.status}.`);
  }
  return { ok: result.status === 0, output: result.stdout };
}

const args = ["branches", action === "ensure" ? "get" : "delete", branch, "--project-ref", projectRef];
if (action === "ensure") args.push("-o", "env");

if (action === "delete") {
  const existing = cli(args, { allowFailure: true });
  if (!existing.ok) console.log(`Supabase preview branch ${branch} is already absent.`);
  else console.log(`Deleted Supabase preview branch ${branch}.`);
} else {
  const existing = cli(args, { allowFailure: true });
  if (!existing.ok) {
    cli(["branches", "create", branch, "--project-ref", projectRef]);
    console.log(`Created Supabase preview branch ${branch}.`);
  }

  let credentials;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = cli(args, { allowFailure: true });
    if (result.ok) {
      const values = Object.fromEntries(
        result.output
          .split(/\r?\n/)
          .map((line) => line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/))
          .filter(Boolean)
          .map(([, key, value]) => [key, value.replace(/^(['"])(.*)\1$/, "$2")]),
      );
      const url = values.SUPABASE_URL || values.API_URL;
      const key = values.SUPABASE_PUBLISHABLE_KEY || values.PUBLISHABLE_KEY || values.ANON_KEY;
      if (url && key) {
        credentials = { url, key };
        break;
      }
    }
    await delay(10_000);
  }

  if (!credentials) {
    throw new Error(`Supabase branch ${branch} did not become ready with API credentials within 10 minutes.`);
  }

  for (const value of Object.values(credentials)) process.stdout.write(`::add-mask::${value}\n`);
  if (process.env.GITHUB_ENV) {
    await appendFile(
      process.env.GITHUB_ENV,
      `SUPABASE_URL=${credentials.url}\nSUPABASE_PUBLISHABLE_KEY=${credentials.key}\nAUTH_KIND=supabase\n`,
    );
  }
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, "auth=supabase\n");
  console.log(`Supabase Auth credentials are ready for preview branch ${branch}.`);
}

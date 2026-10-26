#!/usr/bin/env node

import { appendFile } from "node:fs/promises";
const projectRef = process.env.SUPABASE_PROJECT_REF;
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

if (!projectRef || !accessToken) {
  throw new Error("SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN are required.");
}

// Supabase's API sometimes answers without the publishable key, or with a server error, and has
// it moments later: ask up to five times, five seconds apart, before giving up.
const noKey =
  "No publishable key is available on the main Supabase project. Create one under Settings > API Keys.";
let publicKey;
let problem = noKey;
for (let attempt = 1; attempt <= 5 && !publicKey; attempt++) {
  if (attempt > 1) await new Promise((resolve) => setTimeout(resolve, 5_000));
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/api-keys?reveal=true`,
    { headers: { authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) {
    problem =
      `Supabase returned HTTP ${response.status} while reading the main project's API keys. ` +
      "Check that the access token can read API gateway keys and the project ref is correct.";
    // Only a server error or a rate limit can clear up by itself.
    if (response.status < 500 && response.status !== 429) break;
    continue;
  }
  problem = noKey;
  const keys = await response.json();
  const publishable = keys.find((key) => key.type === "publishable");
  const legacyAnon = keys.find((key) => key.type === "legacy" && key.name === "anon");
  publicKey = publishable?.api_key || legacyAnon?.api_key;
}
if (!publicKey) throw new Error(problem);

const url = `https://${projectRef}.supabase.co`;
for (const value of [url, publicKey]) process.stdout.write(`::add-mask::${value}\n`);
if (process.env.GITHUB_ENV) {
  await appendFile(
    process.env.GITHUB_ENV,
    `SUPABASE_URL=${url}\nSUPABASE_PUBLISHABLE_KEY=${publicKey}\nAUTH_KIND=supabase\n`,
  );
}
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, "auth=supabase\n");
console.log("Using the main Supabase project's Auth URL and publishable key for this preview.");

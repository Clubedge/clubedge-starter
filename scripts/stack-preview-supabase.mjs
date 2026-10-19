#!/usr/bin/env node

import { appendFile } from "node:fs/promises";
const projectRef = process.env.SUPABASE_PROJECT_REF;
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

if (!projectRef || !accessToken) {
  throw new Error("SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN are required.");
}

const response = await fetch(
  `https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/api-keys?reveal=true`,
  { headers: { authorization: `Bearer ${accessToken}` } },
);
if (!response.ok) {
  throw new Error(
    `Supabase returned HTTP ${response.status} while reading the main project's API keys. ` +
      "Check that the access token can read API gateway keys and the project ref is correct.",
  );
}

const keys = await response.json();
const publishable = keys.find((key) => key.type === "publishable");
const legacyAnon = keys.find((key) => key.type === "legacy" && key.name === "anon");
const publicKey = publishable?.api_key || legacyAnon?.api_key;
if (!publicKey) {
  throw new Error(
    "No publishable key is available on the main Supabase project. Create one under Settings > API Keys.",
  );
}

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

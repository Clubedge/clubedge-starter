#!/usr/bin/env node

import { appendFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey =
  process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    "The Vercel Preview environment must define the Supabase URL and publishable key (SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY, or their NEXT_PUBLIC_ equivalents).",
  );
}

for (const value of [supabaseUrl, supabasePublishableKey]) {
  process.stdout.write(`::add-mask::${value}\n`);
}
if (process.env.GITHUB_ENV) {
  const delimiter = `CLUBEDGE_${randomUUID()}`;
  await appendFile(
    process.env.GITHUB_ENV,
    [
      ["SUPABASE_URL", supabaseUrl],
      ["SUPABASE_PUBLISHABLE_KEY", supabasePublishableKey],
    ]
      .map(([name, value]) => `${name}<<${delimiter}\n${value}\n${delimiter}\n`)
      .join(""),
  );
}

if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, "auth=supabase\n");
}
console.log("Supabase Auth is enabled for this preview.");

#!/usr/bin/env node

import { appendFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

// The Vercel project may be configured from either the Next.js app or the generated Vite app.
// Both use the same Supabase project, but their public variable names differ.
const supabaseUrl =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL;
const supabasePublishableKey =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!supabaseUrl || !supabasePublishableKey) {
  const available = Object.keys(process.env)
    .filter((name) => /^(?:SUPABASE_|NEXT_PUBLIC_SUPABASE_|VITE_SUPABASE_)/.test(name))
    .sort();
  throw new Error(
    `The Vercel Preview environment must define the Supabase URL and publishable key. ` +
      `Supported names: SUPABASE_URL/SUPABASE_PUBLISHABLE_KEY, ` +
      `NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, or ` +
      `VITE_SUPABASE_URL/VITE_SUPABASE_PUBLISHABLE_KEY. ` +
      `Available Supabase variable names: ${available.join(", ") || "none"}.`,
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

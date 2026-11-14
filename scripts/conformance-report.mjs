// Turns a vitest JSON report into a per-provider conformance table for the CI run summary, so
// the nightly shows which providers passed against their service, which skipped for lack of one,
// and which failed. A skip is missing evidence, not a pass.
//
//   node scripts/conformance-report.mjs vitest-results.json [summary.md]
import { readFileSync, writeFileSync } from "node:fs";

const [path = "vitest-results.json", output] = process.argv.slice(2);

let report;
try {
  report = JSON.parse(readFileSync(path, "utf8"));
} catch {
  write(output, "The test report is missing; the run failed before any suite executed.\n");
  process.exit(0);
}

const suites = new Map();
for (const file of report.testResults ?? []) {
  for (const test of file.assertionResults ?? []) {
    const key = test.ancestorTitles?.[0] ?? file.name;
    const bucket = suites.get(key) ?? { passed: 0, skipped: 0, failed: 0, failures: [] };
    if (test.status === "passed") bucket.passed++;
    else if (test.status === "failed") {
      bucket.failed++;
      bucket.failures.push([key, ...test.ancestorTitles.slice(1), test.title].join(" > "));
    } else bucket.skipped++;
    suites.set(key, bucket);
  }
}

const conformance = [];
const loose = { passed: 0, skipped: 0, failed: 0, failures: [] };
for (const [name, bucket] of suites) {
  const match = /^(.+) conformance: (.+)$/.exec(name);
  if (match) conformance.push({ module: match[1], provider: match[2], ...bucket });
  else {
    for (const key of ["passed", "skipped", "failed"]) loose[key] += bucket[key];
    if (bucket.failures.length) loose.failures.push(...bucket.failures);
  }
}
conformance.sort(
  (a, b) => a.module.localeCompare(b.module) || a.provider.localeCompare(b.provider),
);

const lines = [
  "## Conformance report",
  "",
  "| Suite | Provider | Passed | Skipped | Failed |",
  "| ----- | -------- | -----: | ------: | -----: |",
];
for (const row of conformance) {
  lines.push(
    `| ${row.module} | ${row.provider} | ${row.passed} | ${row.skipped} | ${row.failed} |`,
  );
}
if (loose.passed || loose.skipped || loose.failed) {
  lines.push(`| Other unit tests | — | ${loose.passed} | ${loose.skipped} | ${loose.failed} |`);
}

const total = (key) => [...suites.values()].reduce((sum, b) => sum + b[key], 0);
lines.push(
  "",
  `**Totals:** ${total("passed")} passed, ${total("skipped")} skipped, ${total("failed")} failed.`,
);
if (total("skipped")) {
  lines.push(
    "Skipped suites had no service or secret to run against — missing evidence, not a pass.",
  );
}
const failures = [...conformance.flatMap((r) => r.failures), ...loose.failures];
if (failures.length) {
  lines.push("", "**Failures:**", ...failures.map((title) => `- ${title}`), "");
}

write(output, `${lines.join("\n")}\n`);

function write(output, text) {
  if (output) writeFileSync(output, text);
  else process.stdout.write(text);
}

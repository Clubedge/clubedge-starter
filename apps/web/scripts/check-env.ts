// Checks the production variables before a deploy build: `pnpm check:env`. Vercel's and Netlify's
// build commands run it first, so a missing key stops the build. It reads the build's environment,
// not .env.local; SKIP_ENV_CHECK=1 builds anyway.
import { checkProductionEnv } from "../src/env/production";

function main() {
  if (process.env.SKIP_ENV_CHECK === "1") {
    console.warn(
      "check:env skipped (SKIP_ENV_CHECK=1): missing variables fail at runtime instead.",
    );
    return;
  }
  const { missing, local, invalid } = checkProductionEnv(process.env);
  if (!missing.length && !local.length && !invalid.length) {
    console.log("✓  check:env: every production variable this project needs is set.");
    return;
  }
  const lines = [
    ...missing.map(({ key, use }) => `✗  ${key} is not set (${use})`),
    ...local.map((key) => `✗  ${key} points at localhost, which the deployed app can't reach`),
    ...invalid.map((problem) => `✗  ${problem}`),
  ];
  console.error(
    [
      "check:env: the production environment is incomplete, so the build stops here.",
      ...lines,
      "Fix them in the host's environment variables for this environment (Production or Preview),",
      "then deploy again. SKIP_ENV_CHECK=1 builds anyway.",
    ].join("\n"),
  );
  process.exit(1);
}

main();

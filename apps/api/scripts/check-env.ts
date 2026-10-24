// Checks the API's production variables before a deploy: `pnpm check:env`. It reads the
// environment it runs in, not .env.local, so run it where the deploy's variables are set;
// SKIP_ENV_CHECK=1 skips it.
import { checkProductionEnv } from "@/env/production";

function main() {
  if (process.env.SKIP_ENV_CHECK === "1") {
    console.warn(
      "check:env skipped (SKIP_ENV_CHECK=1): missing variables fail at runtime instead.",
    );
    return;
  }
  if (process.env.HOST === "127.0.0.1") {
    console.warn(
      "HOST is 127.0.0.1, so only this machine reaches the API. Containers set HOST=0.0.0.0.",
    );
  }
  const { missing, local, invalid } = checkProductionEnv(process.env);
  if (!missing.length && !local.length && !invalid.length) {
    console.log("✓  check:env: every production variable this API needs is set.");
    return;
  }
  const lines = [
    ...missing.map(({ key, use }) => `✗  ${key} is not set (${use})`),
    ...local.map((key) => `✗  ${key} points at localhost, which the deployed API can't reach`),
    ...invalid.map((problem) => `✗  ${problem}`),
  ];
  console.error(
    [
      "check:env: the production environment is incomplete.",
      ...lines,
      "Fix them in the host's environment variables for the API service, then deploy again.",
    ].join("\n"),
  );
  process.exit(1);
}

main();

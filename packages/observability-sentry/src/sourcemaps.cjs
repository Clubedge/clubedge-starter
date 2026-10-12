/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS module, loaded by next.config.ts. */
// Uploads a client build's source maps to Sentry, so browser stack traces are readable there, and
// then deletes them so they are never served. next.config.ts and vite.config.ts call it at build
// time; it does nothing without SENTRY_AUTH_TOKEN. CommonJS, because Next.js loads
// next.config.ts as CommonJS.
const { readdir, rm } = require("node:fs/promises");
const { join } = require("node:path");

/** Whether this build should make source maps: only when they can be uploaded. */
function shouldUploadSourceMaps(env = process.env) {
  return Boolean(env.SENTRY_AUTH_TOKEN);
}

async function deleteSourceMaps(directory) {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".map"))
      .map((entry) => rm(join(entry.parentPath, entry.name))),
  );
}

function createSentryCli(options) {
  const { SentryCli } = require("@sentry/cli");
  return new SentryCli(null, options);
}

/**
 * Injects debug IDs into the bundle in `directory`, uploads its source maps to the Sentry project
 * named by SENTRY_ORG and SENTRY_PROJECT, and deletes them. Resolves false when skipped.
 */
async function uploadSourceMaps(directory, env = process.env, createCli = createSentryCli) {
  if (!shouldUploadSourceMaps(env)) return false;
  const missing = ["SENTRY_ORG", "SENTRY_PROJECT"].filter((name) => !env[name]);
  if (missing.length) {
    throw new Error(
      `SENTRY_AUTH_TOKEN is set, so the build uploads source maps to Sentry; set ${missing.join(" and ")} too.`,
    );
  }
  const cli = createCli({
    authToken: env.SENTRY_AUTH_TOKEN,
    org: env.SENTRY_ORG,
    project: env.SENTRY_PROJECT,
    ...(env.SENTRY_URL ? { url: env.SENTRY_URL } : {}),
  });
  await cli.execute(["sourcemaps", "inject", directory], true);
  await cli.execute(["sourcemaps", "upload", directory], true);
  await deleteSourceMaps(directory);
  return true;
}

module.exports = { shouldUploadSourceMaps, uploadSourceMaps };

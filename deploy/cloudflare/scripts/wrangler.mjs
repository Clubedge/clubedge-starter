// Runs Wrangler on one of this package's configurations, with the Worker named after the project.
// wrangler.jsonc and wrangler.website.jsonc have no "name", so every project uses them as they
// are: this writes a copy of the one asked for with the name in it (*.named.jsonc, which Git
// ignores), and runs Wrangler, at the version pinned here, on that copy.
//
//   node scripts/wrangler.mjs <command> [--website] [arguments for Wrangler]
//
// <command> is Wrangler's, such as deploy or dev, and the other arguments go to Wrangler as they
// are, such as --dry-run. --website picks the website alone (wrangler.website.jsonc), whose Worker
// is told the API's address, which it keeps awake (src/website.ts): VITE_API_URL, which the
// website, built just before, calls the API at. Without it the website could not reach the API, so
// nothing deploys.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { apiAddress, withName, workerName } from "./config.mjs";

const WRANGLER = "wrangler@4.156.0";
const directory = resolve(import.meta.dirname, "..");

const [command, ...rest] = process.argv.slice(2);
if (!command || command.startsWith("-")) {
  console.error("Usage: node scripts/wrangler.mjs <command> [--website] [arguments for Wrangler]");
  process.exit(1);
}
const website = rest.includes("--website");
const passed = rest.filter((argument) => argument !== "--website");

const settings = [];
if (website) {
  const api = apiAddress(process.env.VITE_API_URL);
  if (api) settings.push("--var", `API_URL:${api}`);
  else if (command === "deploy") {
    console.error(
      "VITE_API_URL, the API's address (such as https://my-app-api.onrender.com), is not set or " +
        "not a web address. The website alone calls the API there: set it with the website's " +
        "build variables, as SETUP.md describes (Deploy).",
    );
    process.exit(1);
  }
}

// The Worker is named after the package. A Worker you created under another name: put that name
// here, or write it as "name" in the configuration.
const { name: packageName } = JSON.parse(
  readFileSync(resolve(directory, "../../package.json"), "utf8"),
);
const name = workerName(packageName);

const source = website ? "wrangler.website.jsonc" : "wrangler.jsonc";
const named = source.replace(/\.jsonc$/, ".named.jsonc");
writeFileSync(
  resolve(directory, named),
  `// Written by scripts/wrangler.mjs from ${source}, with the Worker's name: change that file.\n` +
    withName(readFileSync(resolve(directory, source), "utf8"), name),
);

const result = spawnSync(
  "npx",
  ["--yes", WRANGLER, command, "--config", named, ...settings, ...passed],
  { cwd: directory, stdio: "inherit", shell: process.platform === "win32" },
);
process.exit(result.status ?? 1);

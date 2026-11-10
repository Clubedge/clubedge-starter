// What scripts/wrangler.mjs works out before it runs Wrangler, apart from files and processes.

/**
 * The Worker's name, made from the project's package name: lowercase letters, digits and hyphens,
 * 63 characters at most, which is what Cloudflare takes in a workers.dev address.
 * @param {string} packageName
 */
export function workerName(packageName) {
  const name = packageName
    .replace(/^@[^/]+\//, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .slice(0, 63)
    .replace(/^-+|-+$/g, "");
  return name || "web";
}

/**
 * A Wrangler configuration (JSON with comments) with the Worker's name as its first setting. A
 * "name" the configuration sets itself comes after it, and Wrangler uses the later one.
 * @param {string} config
 * @param {string} name
 */
export function withName(config, name) {
  const opening = /^\{\s*$/m;
  if (!opening.test(config)) {
    throw new Error("The configuration has no line of its own that opens it with {.");
  }
  return config.replace(opening, () => `{\n  "name": ${JSON.stringify(name)},`);
}

/**
 * The API's address, for the website alone: `value` (the website's VITE_API_URL) when it is a web
 * address, and undefined when it is unset or anything else.
 * @param {string | undefined} value
 */
export function apiAddress(value) {
  const address = value?.trim();
  const protocol = address && URL.canParse(address) ? new URL(address).protocol : undefined;
  return protocol === "https:" || protocol === "http:" ? address : undefined;
}

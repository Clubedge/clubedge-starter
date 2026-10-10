import { readFileSync } from "node:fs";
import { join } from "node:path";

// The app under test: apps/<E2E_APP>, defaulting to apps/web. Playwright compiles this file
// to CommonJS, so __dirname is available and paths work from any working directory.
const directory = join(__dirname, "..", "apps", process.env.E2E_APP ?? "web");
const readJson = (file: string) => JSON.parse(readFileSync(join(directory, file), "utf8"));

export const e2eApp = {
  packageName: readJson("package.json").name as string,
  site: readJson("src/config/site.json") as { serviceId: string },
};

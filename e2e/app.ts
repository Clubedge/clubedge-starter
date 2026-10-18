import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// The app under test: apps/<E2E_APP>, defaulting to apps/web. Playwright compiles this file
// to CommonJS, so __dirname is available and paths work from any working directory.
const directory = join(__dirname, "..", "apps", process.env.E2E_APP ?? "web");
const readJson = (file: string) => JSON.parse(readFileSync(join(directory, file), "utf8"));

/**
 * Packages whose dev servers run alongside the app: its turbo.json `dev.with`, such as a
 * frontend's API ("@clubedge/api#dev").
 */
function siblings(): string[] {
  if (!existsSync(join(directory, "turbo.json"))) return [];
  const turbo = readJson("turbo.json") as { tasks?: { dev?: { with?: string[] } } };
  return (turbo.tasks?.dev?.with ?? []).map((task) => task.replace(/#dev$/, ""));
}

export const e2eApp = {
  packageName: readJson("package.json").name as string,
  site: readJson("src/config/site.json") as { serviceId: string },
  siblings: siblings(),
};

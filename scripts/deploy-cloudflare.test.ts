import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { withName } from "../deploy/cloudflare/scripts/config.mjs";

// deploy/cloudflare (--deploy cloudflare) runs the API's own image as a Cloudflare Container. The
// Worker starts it with what the API's cloudflare.json says: the image's migrator, then the
// image's own command, on the port the image listens on. Each API has its own Dockerfile, so its
// cloudflare.json must say what that Dockerfile does. Generated projects have one API, in
// apps/api, and the website in apps/web, which is where the Worker's files point; this repository
// has every API.
const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const { slots } = readJson("clubedge.template.json");

const apis = readdirSync("apps")
  .map((name) => `apps/${name}`)
  .filter((app) => existsSync(`${app}/clubedge.stack.json`))
  .map((app) => ({ app, stack: readJson(`${app}/clubedge.stack.json`) }))
  .filter(({ stack }) => stack.role === "api");

/** What a Dockerfile's last lines of each kind say: where the image runs, its port, its command. */
function image(dockerfile: string) {
  const text = readFileSync(dockerfile, "utf8");
  const last = (pattern: RegExp) => [...text.matchAll(pattern)].at(-1)?.[1];
  return {
    directory: last(/^WORKDIR (\S+)$/gm),
    port: Number(last(/^ENV .*\bPORT=(\d+)/gm)),
    command: (JSON.parse(last(/^CMD (\[.+\])$/gm) ?? "[]") as string[]).join(" "),
    migrator: /^COPY .*\.migrator\/? \.\/$/m.test(text),
  };
}

describe("deploy/cloudflare", () => {
  it("is implemented by every API", () => {
    expect(apis.map(({ app }) => app).sort()).toEqual(["apps/api", "apps/api-fastapi"]);
    for (const { app, stack } of apis) {
      expect(stack.modules.deploy.cloudflare.files, app).toEqual(["cloudflare.json"]);
    }
  });

  it.each(apis.map(({ app, stack }) => [app, stack]))(
    "starts the image of %s as its Dockerfile does, after its migrator",
    (app, stack) => {
      const built = image(`${app}/${stack.dockerfile}`);
      // The command runs where the image does, next to the migrator the image bundles.
      expect(built.directory).toBe("/app");
      expect(built.migrator).toBe(true);
      expect(built.command).not.toBe("");
      expect(readJson(`${app}/cloudflare.json`)).toEqual({
        port: built.port,
        healthPath: stack.deployment.healthPath,
        entrypoint: ["sh", "-c", `node migrate.mjs && exec ${built.command}`],
      });
      expect(stack.deployment.port).toBe(built.port);
    },
  );

  it("points at the website and the API where generated projects have them", () => {
    const whole = readFileSync("deploy/cloudflare/wrangler.jsonc", "utf8");
    const website = readFileSync("deploy/cloudflare/wrangler.website.jsonc", "utf8");
    for (const config of [whole, website]) {
      expect(config).toContain(`"directory": "../../${slots.framework.path}/dist"`);
    }
    expect(whole).toContain(`"image": "../../${slots.api.dockerfile}"`);
    expect(readFileSync("deploy/cloudflare/src/index.ts", "utf8")).toContain(
      `from "../../../${slots.api.path}/cloudflare.json"`,
    );
    const scripts = readJson("clubedge/modules/deploy.json").options.cloudflare.scripts;
    for (const script of Object.values<string>(scripts)) {
      expect(script).toContain(`pnpm --filter ${slots.framework.package} build && `);
    }
  });

  it.each(["wrangler.jsonc", "wrangler.website.jsonc"])(
    "leaves the Worker's name in %s to the deploy script",
    (file) => {
      // Every project uses the file as it is, and scripts/wrangler.mjs names the Worker after
      // the project: a name here would be every project's.
      const config = readFileSync(`deploy/cloudflare/${file}`, "utf8");
      expect(config).not.toMatch(/^ {2}"name":/m);
      expect(withName(config, "my-app")).toContain(`\n{\n  "name": "my-app",\n  "main": `);
    },
  );
});

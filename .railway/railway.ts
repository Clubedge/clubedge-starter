// clubedge:if framework=next|tanstack-start
// Railway's configuration for this project, as code: the migrations before each release and the
// health check. `pnpm clubedge deploy` applies it before each release; elsewhere, run
// `railway config apply` once. Railway builds the root Dockerfile; set variables with
// `railway variable set` or the dashboard.
// clubedge:end
// clubedge:if framework=vite|none
// Railway's configuration for this project, as code. Each app runs as its own Railway service,
// built from its own Dockerfile, such as apps/api/Dockerfile: `pnpm clubedge deploy` writes that
// configuration here, with the API's migrations before each release and the health checks, and
// applies it. Deploy with it: as written, this file describes one service built from a root
// Dockerfile, which this project doesn't have.
// clubedge:end
import { readFileSync } from "node:fs";
import { defineRailway, project, service } from "railway/iac";

// The Railway service is named after the package, as `pnpm clubedge deploy` creates it. A service
// you created yourself under another name: put that name here.
const packageName: string = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).name;
const name =
  packageName
    .replace(/^@[^/]+\//, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "web";

// This repository manages only its own resources in the Railway project.
export const partial = name;

export default defineRailway(() => {
  const app = service(name, {
    // Migrations run before each release; a failed migration stops it.
    preDeploy: "node /app/migrate.mjs",
    healthcheck: "/api/health",
    healthcheckTimeout: 60,
  });

  return project(name, {
    variables: { managed: false },
    resources: [app],
  });
});

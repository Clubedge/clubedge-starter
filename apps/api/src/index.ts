import { serve } from "@hono/node-server";
import { createApp } from "@/app";
import { getServerEnv } from "@/env";
import { dependencies } from "@/server";
import { startObservability } from "@/server/observability"; // clubedge:only observability!=none
import { startJobsWorker, stopJobsWorker } from "@/server/jobs"; // clubedge:only jobs!=none

const { HOST, PORT } = getServerEnv();
const observability = startObservability(); // clubedge:only observability!=none
const app = createApp(dependencies);

const server = serve({ fetch: app.fetch, hostname: HOST, port: PORT }, ({ port }) => {
  console.log(`API listening on http://${HOST}:${port}`);
});
// clubedge:if jobs!=none
// Background jobs run in this process, unless JOBS_WORKER=off hands them to a scheduler.
startJobsWorker();
// clubedge:end

// A deploy stops the old process with SIGTERM, and Ctrl+C sends SIGINT: stop taking requests,
// let the ones in progress finish, then exit.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    // Exit anyway if a request never finishes.
    setTimeout(() => process.exit(1), 10_000).unref();
    server.close(async () => {
      await stopJobsWorker(); // clubedge:only jobs!=none
      await observability?.flush(); // clubedge:only observability!=none
      process.exit(0);
    });
  });
}

import { serve } from "@hono/node-server";
import { createApp } from "@/app";
import { getServerEnv } from "@/env";
import { dependencies } from "@/server";

const { HOST, PORT } = getServerEnv();
const app = createApp(dependencies);

serve({ fetch: app.fetch, hostname: HOST, port: PORT }, ({ port }) => {
  console.log(`API listening on http://${HOST}:${port}`);
});

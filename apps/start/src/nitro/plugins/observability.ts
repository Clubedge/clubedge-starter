import { definePlugin } from "nitro";
import { startObservability } from "@/server/observability";

/** Starts error reporting and tracing with the server, and sends what is buffered when it stops. */
export default definePlugin((nitroApp) => {
  const provider = startObservability();
  nitroApp.hooks.hook("close", async () => {
    await provider?.flush();
  });
});

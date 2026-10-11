import { definePlugin } from "nitro";
import { getJobs, startJobsWorker } from "@/server/jobs";

/** Starts the background jobs worker with the server, and stops it with the server. */
export default definePlugin((nitroApp) => {
  startJobsWorker();
  nitroApp.hooks.hook("close", () => getJobs().stop());
});

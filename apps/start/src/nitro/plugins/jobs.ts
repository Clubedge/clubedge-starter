import { definePlugin } from "nitro";
import { startJobsWorker, stopJobsWorker } from "@/server/jobs";

/** Starts the background jobs worker with the server, and stops it with the server. */
export default definePlugin((nitroApp) => {
  startJobsWorker();
  nitroApp.hooks.hook("close", stopJobsWorker);
});

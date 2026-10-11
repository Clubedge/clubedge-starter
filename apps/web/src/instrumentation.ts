/** Runs once when the server starts. */
export async function register() {
  // The worker belongs to the Node.js server: not the Edge runtime, and not `next build`.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { startJobsWorker } = await import("./server/jobs");
  startJobsWorker();
}

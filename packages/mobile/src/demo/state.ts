import type { User } from "@clubedge/contract";

let jobs = 0;

/** An id for a sample job. Counted, since an iOS WebView may not offer crypto.randomUUID(). */
export const jobId = () => `demo-job-${++jobs}`;

/**
 * The demo's data, in memory: it starts signed out with one finished sample job, never leaves
 * the device, and is gone when the app closes.
 */
export const demo = {
  user: null as User | null,
  /** The display name saved in the settings. */
  displayName: null as string | null,
  /** The sample jobs run, newest first. */
  jobs: [{ id: jobId(), createdAt: Date.now() - 60_000 }],
};

import type { JobDefinition } from "@clubedge/jobs";
import { sampleJob } from "./sample";

export { sampleJob };

/** Every job the worker runs. Define a job in this folder, then add it here. */
export const jobs: JobDefinition[] = [sampleJob];

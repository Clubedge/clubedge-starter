import { createMemoryJobs } from "./index";
import { describeJobQueue } from "./conformance";

// The in-memory queue is the reference: the tests' stand-in for a provider.
describeJobQueue("memory", (jobs) => createMemoryJobs(jobs));

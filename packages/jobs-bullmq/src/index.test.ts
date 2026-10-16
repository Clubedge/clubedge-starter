import { describeJobQueue } from "@clubedge/jobs/conformance";
import { createBullMqJobs } from "./index";

// BullMQ runs its Lua scripts in Redis, so these need a real server: REDIS_URL, as in CI.
const redisUrl = process.env.REDIS_URL;

describeJobQueue(
  "bullmq",
  (jobs, { worker }) =>
    createBullMqJobs({
      redisUrl: redisUrl!,
      jobs,
      worker,
      prefix: `test-${process.pid}`,
      onError: () => {},
    }),
  { skip: !redisUrl && "REDIS_URL is not set", timeoutMs: 45_000 },
);

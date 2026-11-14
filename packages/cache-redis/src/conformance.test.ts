import { describeCache, describeRateLimiter } from "@clubedge/cache/conformance";
import { createRedisCache, createRedisRateLimiter } from "./index";

// Against a real Redis: REDIS_URL, as CI provides it for the BullMQ provider's tests. Each suite
// run gets its own key prefix, so runs on a shared database never collide.
const redisUrl = process.env.REDIS_URL;
const run = `${process.pid}-${Date.now().toString(36)}`;
let counter = 0;
const prefix = () => `clubedge:test:${run}:${counter++}:`;

describeCache("redis", () => createRedisCache(redisUrl!, prefix()), {
  skip: !redisUrl && "REDIS_URL is not set",
});

describeRateLimiter("redis", (options) => createRedisRateLimiter(redisUrl!, options, prefix()), {
  skip: !redisUrl && "REDIS_URL is not set",
});

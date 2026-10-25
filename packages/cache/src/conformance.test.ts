import { describeCache, describeRateLimiter } from "./conformance";
import { createMemoryCache, createMemoryRateLimiter } from "./index";

// The in-memory reference provider, so the shared suites always run somewhere without a service.
describeCache("memory", () => createMemoryCache());

describeRateLimiter("memory", (options) => createMemoryRateLimiter(options));

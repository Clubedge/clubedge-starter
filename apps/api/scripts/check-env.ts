// Validates the API's production environment before a deploy: `pnpm check:env`.
import { getServerEnv } from "@/env";

const env = getServerEnv();
if (env.NODE_ENV === "production" && env.HOST === "127.0.0.1") {
  console.warn(
    "HOST is 127.0.0.1, so only this machine reaches the API. Containers set HOST=0.0.0.0.",
  );
}
console.log("API environment is valid.");

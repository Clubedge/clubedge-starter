// Checks that the services the API needs answer: `pnpm check:services`.
import { isReady } from "@/server/db";

if (await isReady()) {
  console.log("Database: reachable.");
  process.exit(0);
}
console.error(
  "Database: not reachable. Check DATABASE_URL in apps/api/.env.local, then start it (pnpm infra:up).",
);
process.exit(1);

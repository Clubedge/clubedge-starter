// Loads .env.local, when there is one, before the API starts in development: what
// --env-file-if-exists does. `pnpm dev` cannot pass that flag with --watch, since Node 22.23
// watches the file even when it is missing, and stops at once on the error.
import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

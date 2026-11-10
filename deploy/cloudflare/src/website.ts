// The website alone, on Cloudflare's free plan (wrangler.website.jsonc). Cloudflare serves the
// website's files without running this Worker, and the API runs on another host, which the
// website calls at its own address. What the Worker adds runs every five minutes (the config's
// "crons"): a request for the API's health, on the API's own host. A host that stops an API no
// request has reached for a while, as Render's free plan does after 15 minutes, keeps it running,
// so no visitor waits for it to start again. A run whose request fails throws, which the Worker's
// logs and its cron events show.
import { healthUrl } from "./keep-awake";

interface Env {
  /** The website's files. */
  ASSETS: Fetcher;
  /** The API's address: the website's VITE_API_URL, which scripts/wrangler.mjs passes on. */
  API_URL?: string;
}

/** Long enough for a stopped API to start: about a minute on Render's free plan. */
const ANSWER_TIMEOUT_MS = 90_000;

export default {
  // A request no file answers: the files' own answer, as without a Worker.
  fetch(request, env) {
    return env.ASSETS.fetch(request);
  },

  async scheduled(_controller, env) {
    const url = healthUrl(env.API_URL);
    if (!url) return;
    const response = await fetch(url, { signal: AbortSignal.timeout(ANSWER_TIMEOUT_MS) });
    await response.body?.cancel();
    if (!response.ok) throw new Error(`The API answered its health check with ${response.status}.`);
  },
} satisfies ExportedHandler<Env>;

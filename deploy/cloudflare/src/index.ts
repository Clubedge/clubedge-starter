// The whole app on Cloudflare as one Worker. Cloudflare serves the website's files (apps/web's
// build) by itself, and hands this Worker the API's paths, which it forwards to the API's own
// image (apps/api/Dockerfile) running as a Cloudflare Container. The app knows nothing of
// Cloudflare: any other host runs the same files and the same image.
import { DurableObject } from "cloudflare:workers";
// How the API's image runs here: the port it listens on, its health check, and the command that
// starts it, which applies the migrations first. Each API says so for its own image.
import image from "../../../apps/api/cloudflare.json";
import { apiLocation, containerEnv, idleTimeoutMs, isApiPath } from "./routing";

interface Env {
  /** The API's container, through its Durable Object: one instance. */
  API: DurableObjectNamespace<Api>;
  /** The website's files. */
  ASSETS: Fetcher;
  /** The variables and secrets, passed on to the API (./routing's containerEnv). */
  [setting: string]: unknown;
}

/** How long the API may take to start, its migrations included. */
const START_ATTEMPTS = 120;
const START_INTERVAL_MS = 500;

export class Api extends DurableObject<Env> {
  /** The API started and answering, once it is; cleared when it stops, to start it again. */
  private ready: Promise<void> | undefined;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const container = ctx.container!;
    // A deploy restarts this object while the container runs on, without its timeout.
    if (container.running) {
      void ctx.blockConcurrencyWhile(() => container.setInactivityTimeout(idleTimeoutMs(env)));
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    // Requests that arrive while the API starts wait for the same start.
    this.ready ??= this.start(url.origin).catch((error: unknown) => {
      this.ready = undefined;
      throw error;
    });
    try {
      await this.ready;
    } catch (error) {
      console.error("The API did not start:", error);
      return unavailable();
    }
    url.protocol = "http:";
    url.host = "container";
    const forwarded = new Request(url, request);
    forwarded.headers.delete("host");
    try {
      // Returned as it comes, so an answer that streams, or upgrades to a WebSocket, goes through.
      return await this.ctx.container!.getTcpPort(image.port).fetch(forwarded);
    } catch (error) {
      // The container went away under the request: the next one starts it again.
      console.error("The API did not answer:", error);
      this.ready = undefined;
      return unavailable();
    }
  }

  private async start(origin: string): Promise<void> {
    const container = this.ctx.container!;
    if (!container.running) {
      container.start({
        enableInternet: true,
        // The image's migrator, then the API: a new version's migrations apply before it serves.
        entrypoint: image.entrypoint,
        env: containerEnv(this.env, origin),
      });
      // Its end, in the Worker's logs; and the next request starts it again.
      container.monitor().then(
        () => {
          console.log("The API stopped.");
          this.ready = undefined;
        },
        (error: unknown) => {
          console.error("The API failed:", error);
          this.ready = undefined;
        },
      );
    }
    await container.setInactivityTimeout(idleTimeoutMs(this.env));
    await this.answering();
  }

  /** Waits for the API's health check to answer, as it does once the API listens. */
  private async answering(): Promise<void> {
    const port = this.ctx.container!.getTcpPort(image.port);
    let last: unknown;
    for (let attempt = 0; attempt < START_ATTEMPTS; attempt++) {
      try {
        const response = await port.fetch(`http://container${image.healthPath}`, {
          signal: AbortSignal.timeout(2_000),
        });
        await response.body?.cancel();
        if (response.ok) return;
        last = new Error(`The health check answered ${response.status}.`);
      } catch (error) {
        last = error;
      }
      await scheduler.wait(START_INTERVAL_MS);
    }
    throw new Error("The API did not answer its health check in time.", { cause: last });
  }
}

/** The answer while the API cannot be reached: the app tries again, as on any network error. */
function unavailable(): Response {
  return Response.json(
    { error: { code: "unavailable", message: "The server is starting. Try again." } },
    { status: 503, headers: { "retry-after": "2" } },
  );
}

export default {
  async fetch(request, env): Promise<Response> {
    // Anything else that reaches the Worker is the website's: its files' own answer.
    if (!isApiPath(new URL(request.url).pathname)) return env.ASSETS.fetch(request);
    // One API, which Cloudflare starts near its first request, or in the region API_LOCATION names.
    const location = apiLocation(env);
    const api = env.API.get(env.API.idFromName("api"), location && { locationHint: location });
    return api.fetch(request);
  },
} satisfies ExportedHandler<Env>;

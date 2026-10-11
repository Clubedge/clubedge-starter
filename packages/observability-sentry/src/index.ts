import * as Sentry from "@sentry/node";
import type {
  ErrorContext,
  ObservabilityProvider,
  TelemetryAttributes,
} from "@clubedge/observability";

export interface SentryObservabilityConfig {
  /** The project's DSN, from Sentry's project settings (Client Keys). */
  dsn: string;
  /** Such as "production" or "preview". */
  environment?: string;
  /** The deployed version, such as a commit SHA, to tell releases apart. */
  release?: string;
  /** The share of requests traced, from 0 to 1. Default 0.1. */
  tracesSampleRate?: number;
  /** For tests: where envelopes go instead of Sentry. */
  transport?: Sentry.NodeOptions["transport"];
}

const toAttributes = (attributes: TelemetryAttributes = {}) =>
  Object.fromEntries(
    Object.entries(attributes).filter(([, value]) => value !== undefined),
  ) as Record<string, string | number | boolean>;

/**
 * Server errors and traces sent to Sentry. Sentry's SDK also collects the spans Next.js and
 * pg-boss create through OpenTelemetry, so they appear in the same traces.
 */
export function createSentryObservability({
  dsn,
  environment,
  release,
  tracesSampleRate = 0.1,
  transport,
}: SentryObservabilityConfig): ObservabilityProvider {
  Sentry.init({
    dsn,
    environment,
    release,
    tracesSampleRate,
    // Spans that Next.js and pg-boss create through OpenTelemetry become Sentry spans.
    enableOpenTelemetrySetup: true,
    // Both apps run bundled server code, where Sentry's load-time module hooks cannot apply.
    enableRuntimeChannelInjection: false,
    // Keep user details, cookies, query strings, and request bodies out of what is sent.
    dataCollection: { userInfo: false, cookies: false, urlQueryParams: false, httpBodies: [] },
    ...(transport ? { transport } : {}),
  });

  return {
    id: "sentry",

    reportError(error: unknown, context: ErrorContext = {}) {
      Sentry.captureException(error, {
        tags: toAttributes(context.attributes),
        ...(context.message ? { extra: { message: context.message } } : {}),
      });
    },

    traced(name, run, attributes) {
      return Sentry.startSpan({ name, attributes: toAttributes(attributes) }, () => run());
    },

    async flush(timeoutMs = 2_000) {
      await Sentry.flush(timeoutMs);
    },
  };
}

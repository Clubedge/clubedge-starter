import { z } from "zod";
import { reportError, setTelemetry } from "@clubedge/core";
import type { BrowserErrorReporting, ObservabilityProvider } from "@clubedge/observability";
import { createSentryObservability } from "@clubedge/observability-sentry";
import { optional, parseEnv } from "@/env";

// Sentry: server errors and traces. Without a DSN, nothing is sent and errors keep going to the
// server log.
const observabilityEnvSchema = z.object({
  SENTRY_DSN: optional(z.url()),
  SENTRY_ENVIRONMENT: optional(z.string()),
  SENTRY_RELEASE: optional(z.string()),
  // The share of requests traced, from 0 to 1; an empty value keeps the default, 0.1.
  SENTRY_TRACES_SAMPLE_RATE: optional(
    z.string().regex(/^(0(\.\d+)?|1(\.0+)?)$/, "a number from 0 to 1"),
  ),
});

const globalForObservability = globalThis as typeof globalThis & {
  clubedgeObservability?: ObservabilityProvider | null;
};

/** Installs the provider once per process; called when the server starts. */
export function startObservability(): ObservabilityProvider | null {
  if (globalForObservability.clubedgeObservability !== undefined)
    return globalForObservability.clubedgeObservability;
  let env: z.infer<typeof observabilityEnvSchema>;
  try {
    env = parseEnv(observabilityEnvSchema, "Observability");
  } catch (error) {
    // An invalid variable leaves observability off rather than stopping the server.
    reportError(error, { message: "Observability did not start." });
    globalForObservability.clubedgeObservability = null;
    return null;
  }
  const provider = env.SENTRY_DSN
    ? createSentryObservability({
        dsn: env.SENTRY_DSN,
        environment: env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,
        release: env.SENTRY_RELEASE || undefined,
        tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE
          ? Number(env.SENTRY_TRACES_SAMPLE_RATE)
          : undefined,
      })
    : null;
  if (provider) setTelemetry(provider);
  globalForObservability.clubedgeObservability = provider;
  return provider;
}

/** With a DSN, the browser reports its errors to Sentry directly; the DSN is public by design. */
export function browserErrorReporting(): BrowserErrorReporting {
  try {
    const env = parseEnv(observabilityEnvSchema, "Observability");
    if (!env.SENTRY_DSN) return { provider: "none" };
    return {
      provider: "sentry",
      dsn: env.SENTRY_DSN,
      environment: env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,
      ...(env.SENTRY_RELEASE ? { release: env.SENTRY_RELEASE } : {}),
    };
  } catch {
    return { provider: "none" };
  }
}

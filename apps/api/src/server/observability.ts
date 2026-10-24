import { z } from "zod";
import { reportError, setTelemetry } from "@clubedge/core";
import type { BrowserErrorReporting, ObservabilityProvider } from "@clubedge/observability";
import { createOtelObservability, parseOtlpHeaders } from "@clubedge/observability-otel";
import { siteConfig } from "@/config/site";
import { optional, parseEnv } from "@/env";

// OpenTelemetry: traces and error logs over OTLP/HTTP to any collector. Without an endpoint,
// nothing is sent and errors keep going to the server log.
const observabilityEnvSchema = z.object({
  OTEL_EXPORTER_OTLP_ENDPOINT: optional(z.url()),
  OTEL_EXPORTER_OTLP_HEADERS: optional(z.string()),
  OTEL_SERVICE_NAME: optional(z.string()),
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
  const provider = env.OTEL_EXPORTER_OTLP_ENDPOINT
    ? createOtelObservability({
        endpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
        headers: parseOtlpHeaders(env.OTEL_EXPORTER_OTLP_HEADERS),
        serviceName: env.OTEL_SERVICE_NAME || siteConfig.serviceId,
      })
    : null;
  if (provider) setTelemetry(provider);
  globalForObservability.clubedgeObservability = provider;
  return provider;
}

/** Browser errors go to /api/client-errors, which reports them like server errors. */
export function browserErrorReporting(): BrowserErrorReporting {
  return { provider: "endpoint" };
}

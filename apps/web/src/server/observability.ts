import "server-only";
import { z } from "zod";
import { setTelemetry } from "@clubedge/core";
import type { ObservabilityProvider } from "@clubedge/observability";
import { createOtelObservability, parseOtlpHeaders } from "@clubedge/observability-otel";
import { siteConfig } from "@/config/site";
import { optional, parseEnv } from "@/env/server";

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
  const env = parseEnv(observabilityEnvSchema, "Observability");
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

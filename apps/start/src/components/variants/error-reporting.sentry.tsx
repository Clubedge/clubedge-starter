import { useEffect } from "react";
import type { BrowserErrorReporting } from "@clubedge/observability";

/**
 * Reports uncaught browser errors to Sentry. The settings come from /api/client-errors at
 * runtime, and Sentry's browser SDK is only downloaded when a DSN is configured.
 */
export function ErrorReporting() {
  useEffect(() => {
    fetch("/api/client-errors")
      .then((response) =>
        response.ok ? (response.json() as Promise<BrowserErrorReporting>) : null,
      )
      .then(async (config) => {
        if (config?.provider !== "sentry") return;
        const { startBrowserErrorReporting } =
          await import("@clubedge/observability-sentry/browser");
        startBrowserErrorReporting(config);
      })
      .catch(() => {});
  }, []);
  return null;
}

import { useEffect } from "react";
import { api } from "@/lib/api";

type Capture = (error: unknown) => void;
let reporting: Promise<Capture | null> | undefined;

// The settings come from the API at runtime, and Sentry's browser SDK is only downloaded when a
// DSN is configured.
function startReporting() {
  reporting ??= api
    .GET("/api/client-errors")
    .then(async ({ data: config }) => {
      if (config?.provider !== "sentry") return null;
      const { captureBrowserError, startBrowserErrorReporting } =
        await import("@clubedge/observability-sentry/browser");
      startBrowserErrorReporting(config);
      return captureBrowserError;
    })
    .catch(() => null);
  return reporting;
}

/** Reports a render error that an error boundary caught, so it never reaches the window. */
export function reportBrowserError(error: unknown) {
  void startReporting().then((capture) => capture?.(error));
}

/** Reports uncaught browser errors to Sentry. */
export function ErrorReporting() {
  useEffect(() => {
    void startReporting();
  }, []);
  return null;
}

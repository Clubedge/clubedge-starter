"use client";

import { useEffect } from "react";
import type { BrowserErrorReporting } from "@clubedge/observability";

type Capture = (error: unknown) => void;
let reporting: Promise<Capture | null> | undefined;

// The settings come from /api/client-errors at runtime, and Sentry's browser SDK is only
// downloaded when a DSN is configured.
function startReporting() {
  reporting ??= fetch("/api/client-errors")
    .then((response) => (response.ok ? (response.json() as Promise<BrowserErrorReporting>) : null))
    .then(async (config) => {
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

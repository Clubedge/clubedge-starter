"use client";

import { useEffect } from "react";

const MAX_REPORTS = 10;

function describe(reason: unknown) {
  if (reason instanceof Error)
    return { name: reason.name, message: reason.message, stack: reason.stack };
  return { name: "Error", message: String(reason) };
}

/**
 * Sends uncaught errors and unhandled promise rejections from the browser to /api/client-errors,
 * which reports them like server errors. At most a few per page load.
 */
export function ErrorReporting() {
  useEffect(() => {
    let sent = 0;
    function send(kind: "error" | "unhandledrejection", reason: unknown) {
      if (sent >= MAX_REPORTS) return;
      sent++;
      const body = JSON.stringify({ kind, ...describe(reason), path: window.location.pathname });
      // keepalive lets the report finish even if the page is being closed.
      fetch("/api/client-errors", {
        method: "POST",
        body,
        headers: { "content-type": "application/json" },
        keepalive: true,
      }).catch(() => {});
    }
    const onError = (event: ErrorEvent) => send("error", event.error ?? event.message);
    const onRejection = (event: PromiseRejectionEvent) => send("unhandledrejection", event.reason);
    // Capture phase: runs before handlers that might stop the event, such as a dev overlay.
    window.addEventListener("error", onError, true);
    window.addEventListener("unhandledrejection", onRejection, true);
    return () => {
      window.removeEventListener("error", onError, true);
      window.removeEventListener("unhandledrejection", onRejection, true);
    };
  }, []);
  return null;
}

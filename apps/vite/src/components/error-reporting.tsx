import { useEffect } from "react";
import type { ClientErrorReport } from "@clubedge/contract";
import { api } from "@/lib/api";

const MAX_REPORTS = 10;
let sent = 0;

function describe(reason: unknown) {
  if (reason instanceof Error)
    return { name: reason.name, message: reason.message, stack: reason.stack };
  return { name: "Error", message: String(reason) };
}

function send(kind: ClientErrorReport["kind"], reason: unknown) {
  if (sent >= MAX_REPORTS) return;
  sent++;
  // keepalive lets the report finish even if the page is being closed.
  api
    .POST("/api/client-errors", {
      body: { kind, ...describe(reason), path: window.location.pathname },
      keepalive: true,
    })
    .catch(() => {});
}

/** Reports a render error that an error boundary caught, so it never reaches the window. */
export function reportBrowserError(error: unknown) {
  send("render", error);
}

/**
 * Sends uncaught errors and unhandled promise rejections from the browser to /api/client-errors,
 * which reports them like server errors. At most a few per page load.
 */
export function ErrorReporting() {
  useEffect(() => {
    // A failed <img> or <script> also reaches this capture listener, as a plain Event without an
    // error or message: only script errors are reported.
    const onError = (event: Event) => {
      if (event instanceof ErrorEvent) send("error", event.error ?? event.message);
    };
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

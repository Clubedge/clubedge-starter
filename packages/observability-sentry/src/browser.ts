import * as Sentry from "@sentry/browser";

export interface BrowserSentryConfig {
  dsn: string;
  environment?: string;
  release?: string;
}

let started = false;

/**
 * Reports uncaught errors and unhandled promise rejections in the browser to Sentry. Starts once;
 * later calls do nothing.
 */
export function startBrowserErrorReporting({
  dsn,
  environment,
  release,
}: BrowserSentryConfig): void {
  if (started) return;
  started = true;
  Sentry.init({
    dsn,
    environment,
    release,
    // Errors only: browser tracing would add trace headers to the app's requests.
    tracesSampleRate: 0,
    // Keep user details, cookies, query strings, and request bodies out of what is sent.
    dataCollection: { userInfo: false, cookies: false, urlQueryParams: false, httpBodies: [] },
  });
}

/** Reports an error that the app caught itself, such as one stopped by a React error boundary. */
export function captureBrowserError(error: unknown): void {
  if (started) Sentry.captureException(error);
}

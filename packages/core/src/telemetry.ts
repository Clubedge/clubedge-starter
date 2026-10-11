// Error reporting and tracing hooks. Application code and packages call reportError and traced;
// when the project has an observability module, its provider replaces the defaults at startup.
// Without one, errors go to the console and traced() only runs the function.

export type TelemetryAttributes = Record<string, string | number | boolean | undefined>;

export interface ErrorContext {
  /** What failed, in a few words, such as "Payment webhook failed". */
  message?: string;
  attributes?: TelemetryAttributes;
}

export interface Telemetry {
  reportError(error: unknown, context?: ErrorContext): void;
  traced<T>(name: string, run: () => Promise<T>, attributes?: TelemetryAttributes): Promise<T>;
}

const consoleTelemetry: Telemetry = {
  reportError(error, context) {
    console.error(context?.message ?? "Unexpected error", error);
  },
  traced: (_name, run) => run(),
};

// Kept on globalThis: Next.js loads instrumentation.ts and the app as separate module graphs,
// and both must see the provider installed at startup.
const holder = globalThis as typeof globalThis & { __clubedgeTelemetry?: Telemetry };

/** Installs a provider, or restores the console default with null. */
export function setTelemetry(telemetry: Telemetry | null): void {
  holder.__clubedgeTelemetry = telemetry ?? undefined;
}

// Errors already reported, so one caught by a route and again by a framework hook is sent once.
const reported = new WeakSet<object>();

/** Reports an error that was handled but should be seen. Never throws. */
export function reportError(error: unknown, context?: ErrorContext): void {
  if (typeof error === "object" && error !== null) {
    if (reported.has(error)) return;
    reported.add(error);
  }
  const telemetry = holder.__clubedgeTelemetry;
  if (!telemetry) return consoleTelemetry.reportError(error, context);
  try {
    telemetry.reportError(error, context);
  } catch (reportFailure) {
    consoleTelemetry.reportError(error, context);
    console.error("Error reporting failed", reportFailure);
  }
}

/** Runs `run` inside a span named `name` when a provider traces, and plainly otherwise. */
export function traced<T>(
  name: string,
  run: () => Promise<T>,
  attributes?: TelemetryAttributes,
): Promise<T> {
  return (holder.__clubedgeTelemetry ?? consoleTelemetry).traced(name, run, attributes);
}

type AsyncMethods = Record<string, (...args: never[]) => Promise<unknown>>;

/**
 * Wraps each method of a composition-root object in a span named "<prefix>.<method>", such as
 * "storage.upload". Every method must return a promise.
 */
export function withSpans<T extends AsyncMethods>(prefix: string, target: T): T {
  return Object.fromEntries(
    Object.entries(target).map(([name, method]) => [
      name,
      (...args: never[]) => traced(`${prefix}.${name}`, () => method.apply(target, args)),
    ]),
  ) as T;
}

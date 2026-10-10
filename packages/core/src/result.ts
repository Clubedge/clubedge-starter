/** Expected failures are returned as values; exceptions are reserved for the unexpected. */
export type Result<T, E extends string = string> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E extends string>(error: E): Result<never, E> {
  return { ok: false, error };
}

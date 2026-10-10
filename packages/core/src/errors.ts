export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status = 400,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AppError";
  }
}

export function errorResponse(error: unknown) {
  const known = error instanceof AppError;
  const status = known ? error.status : 500;
  const message = known ? error.message : "An unexpected error occurred.";
  const code = known ? error.code : "INTERNAL_ERROR";
  if (!known) console.error("Unhandled application error", error);
  return Response.json({ error: { code, message } }, { status });
}

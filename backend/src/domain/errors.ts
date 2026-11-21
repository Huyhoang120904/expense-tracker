export type ErrorCode =
  | "invalid_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "idempotency_conflict"
  | "unsupported_media_type"
  | "validation_error"
  | "internal_error";

export type HttpErrorStatus = 400 | 401 | 403 | 404 | 409 | 415 | 422 | 500;

export class AppError extends Error {
  readonly status: HttpErrorStatus;
  readonly code: ErrorCode;
  readonly fields?: Record<string, string>;

  constructor(
    status: HttpErrorStatus,
    code: ErrorCode,
    message: string,
    fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export function badRequest(
  message = "The request is malformed.",
  fields?: Record<string, string>,
): AppError {
  return new AppError(400, "invalid_request", message, fields);
}

export function unauthorized(
  message = "A valid credential is required.",
): AppError {
  return new AppError(401, "unauthorized", message);
}

export function forbidden(
  message = "This credential cannot perform the requested operation.",
): AppError {
  return new AppError(403, "forbidden", message);
}

export function notFound(
  message = "The transaction is unavailable.",
): AppError {
  return new AppError(404, "not_found", message);
}

export function idempotencyConflict(
  message = "Use a new key for a different transaction.",
): AppError {
  return new AppError(409, "idempotency_conflict", message);
}

export function unsupportedMediaType(
  message = "Send the request as application/json.",
): AppError {
  return new AppError(415, "unsupported_media_type", message);
}

export function validationError(
  message = "One or more transaction fields are invalid.",
  fields?: Record<string, string>,
): AppError {
  return new AppError(422, "validation_error", message, fields);
}

export function internalError(
  message = "The request could not be completed.",
): AppError {
  return new AppError(500, "internal_error", message);
}

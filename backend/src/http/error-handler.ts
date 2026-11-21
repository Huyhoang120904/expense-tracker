import type { Context } from "hono";
import { AppError, internalError } from "../domain/errors";

export function toErrorResponse(c: Context, err: unknown): Response {
  const appError =
    err instanceof AppError ? err : internalError("The request could not be completed.");

  if (!(err instanceof AppError)) {
    console.error("Unhandled worker error:", err);
  }

  const errorBody: {
    error: {
      code: AppError["code"];
      message: string;
      fields?: Record<string, string>;
    };
  } = {
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.fields && Object.keys(appError.fields).length > 0
        ? { fields: appError.fields }
        : {}),
    },
  };

  return c.json(errorBody, appError.status);
}

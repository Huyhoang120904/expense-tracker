import type { Context } from "hono";
import type { ZodError } from "zod";
import { badRequest, unsupportedMediaType } from "../domain/errors";

export function assertJsonContentType(c: Context): void {
  const raw = c.req.header("Content-Type");
  if (!raw) {
    throw unsupportedMediaType();
  }
  const mediaType = raw.split(";")[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    throw unsupportedMediaType();
  }
}

export async function parseJsonBody(
  c: Context,
): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw badRequest("Request body must be valid JSON.");
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw badRequest("Request body must be a JSON object.");
  }

  return body as Record<string, unknown>;
}

export function zodErrorToFields(err: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of err.issues) {
    const key =
      issue.path.length > 0 ? issue.path.map(String).join(".") : "_root";
    if (!(key in fields)) {
      fields[key] = issue.message;
    }
  }
  return fields;
}
